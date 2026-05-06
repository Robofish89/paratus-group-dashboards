import 'server-only';

import { createHash } from 'node:crypto';
import { createClient } from '../server';
import type { Database, Json } from '../types/database';

/**
 * Phase 6 plan 06-02 — audit log DAL.
 *
 * Two surfaces:
 *   * `recordAudit(...)` — write a single audit row through the SECURITY
 *     DEFINER `record_audit()` RPC. The RPC bypasses RLS but resolves
 *     `auth.uid()` / `auth.jwt()` from the calling cookie session, so the
 *     caller's identity + role are captured truthfully.
 *   * `getAuditLog(...)` — read rows back through the cookie-authed client so
 *     RLS does the visibility split (HQ sees all; country admins see their
 *     country + cross-country-visible rows; agents see nothing).
 *
 * Plus two helpers:
 *   * `computeDiff(before, after)` — produce a `{ field: { before, after } }`
 *     diff containing only changed keys (avoids storing whole-row PII).
 *   * `hashIpAddress(ip)` — sha256 over `ip + IP_HASH_SALT`. Never store raw IP.
 */

type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];

export type AuditAction =
  | 'lead.reassign'
  | 'lead.complete'
  | 'lead.callback'
  | 'lead.no_answer'
  | 'lead.contact'
  | 'user_role.update';

export type AuditTarget = 'lead' | 'user_role' | 'callback';

export type AuditRow = AuditLogRow;

/**
 * Field-level diff: `{ field: { before: <prev>, after: <next> } }`. Stored as
 * the `diff jsonb` column. Whole-row snapshots are deliberately avoided —
 * narrows the PII surface and keeps the column from bloating.
 */
export type AuditDiff = Record<string, { before: unknown; after: unknown }>;

export interface RecordAuditInput {
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  countryCode: string;
  diff: AuditDiff;
  /**
   * Defaults to `[countryCode]`. Pass `[source, target]` for HQ-initiated
   * cross-country reassign so BOTH country admins see the row.
   */
  visibleToCountryCodes?: string[];
  /**
   * Caller-computed `hashIpAddress(req.headers.get('x-forwarded-for') ?? '')`.
   * Optional — pass `undefined` if no IP is known.
   */
  ipHash?: string;
}

export interface GetAuditLogInput {
  /**
   * Filter to a single country (HQ uses this when drilling into a country
   * page). Country admins can pass their own code; RLS would scope them
   * regardless. Pass `null` to fetch every visible row.
   */
  countryCode?: string | null;
  /** Filter by `action` (e.g. only `'lead.reassign'`). */
  filter?: AuditAction | null;
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 50. */
  pageSize?: number;
}

export interface GetAuditLogResult {
  rows: AuditRow[];
  total: number;
}

/** Default page size for the audit viewer. */
export const AUDIT_LOG_PAGE_SIZE = 50;

/**
 * Compact row shape for the HQ Overview "Recent group activity" panel.
 * Joins `audit_log` with the actor's `user_roles.display_name` and the
 * `countries.name` for the surfaced row's `country_code`. Whatever is
 * visible to the caller through RLS — HQ admins see all rows; country
 * admins see their country plus cross-country-visible rows.
 */
export interface GroupActivityRow {
  id: string;
  created_at: string;
  action: string;
  target_type: string;
  target_id: string;
  country_code: string;
  country_name: string | null;
  actor_id: string | null;
  actor_role: string;
  actor_display_name: string | null;
}

// ─── Writes ────────────────────────────────────────────────────────────────

/**
 * Insert a single row into `audit_log` via the `record_audit` RPC. The RPC is
 * SECURITY DEFINER so the write bypasses RLS, but `auth.uid()` and
 * `auth.jwt()` resolve to the calling user — the cookie-authed client is the
 * correct authority. Throws on RPC error so callers can `try/catch` and
 * decide whether the audit failure should bubble up.
 */
export async function recordAudit(input: RecordAuditInput): Promise<string> {
  const supabase = await createClient();
  const visibility = input.visibleToCountryCodes ?? [input.countryCode];
  const { data, error } = await supabase.rpc('record_audit', {
    p_action: input.action,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_country_code: input.countryCode,
    p_diff: input.diff as unknown as Json,
    p_visible_to_country_codes: visibility,
    p_ip_hash: input.ipHash,
  });

  if (error) {
    throw new Error(`record_audit RPC failed: ${error.message}`);
  }
  return data as string;
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Page through the audit log. RLS handles the visibility split — country
 * admins implicitly see only their country (+ cross-country-visible rows);
 * HQ sees all and may narrow with `countryCode`. Agents have no policy that
 * matches, so they see zero rows.
 */
export async function getAuditLog(
  input: GetAuditLogInput = {},
): Promise<GetAuditLogResult> {
  const page = input.page && input.page >= 1 ? Math.floor(input.page) : 1;
  const pageSize =
    input.pageSize && input.pageSize >= 1 ? Math.floor(input.pageSize) : AUDIT_LOG_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (input.countryCode) {
    query = query.eq('country_code', input.countryCode);
  }
  if (input.filter) {
    query = query.eq('action', input.filter);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`getAuditLog failed: ${error.message}`);
  }
  return {
    rows: (data ?? []) as AuditRow[],
    total: count ?? 0,
  };
}

/**
 * Most recent N audit rows visible to the caller, with actor display name +
 * country name resolved in one pass. RLS scopes row visibility — HQ admins
 * see the entire group; country admins see their own + cross-country-visible
 * rows; agents see nothing. Powers the HQ Overview "Recent group activity"
 * panel.
 *
 * Three reads in parallel — audit_log, user_roles (actors), countries —
 * zipped in JS. No new view: keeps the DAL surgical and the perf bounded
 * (`limit` capped to 25).
 */
export async function getRecentGroupActivity(
  limit: number = 10,
): Promise<GroupActivityRow[]> {
  const cap = Math.max(1, Math.min(Math.floor(limit), 25));
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('audit_log')
    .select(
      'id, created_at, action, target_type, target_id, country_code, actor_id, actor_role',
    )
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(`getRecentGroupActivity audit failed: ${error.message}`);
  }

  const visible = rows ?? [];
  if (visible.length === 0) return [];

  const actorIds = Array.from(
    new Set(
      visible
        .map((r) => r.actor_id)
        .filter((v): v is string => typeof v === 'string'),
    ),
  );
  const countryCodes = Array.from(
    new Set(visible.map((r) => r.country_code).filter(Boolean)),
  );

  const [actorRes, countryRes] = await Promise.all([
    actorIds.length > 0
      ? supabase
          .from('user_roles')
          .select('user_id, display_name')
          .in('user_id', actorIds)
      : Promise.resolve({ data: [], error: null as null }),
    countryCodes.length > 0
      ? supabase
          .from('countries')
          .select('code, name')
          .in('code', countryCodes)
      : Promise.resolve({ data: [], error: null as null }),
  ]);

  if (actorRes.error) {
    throw new Error(
      `getRecentGroupActivity actors failed: ${actorRes.error.message}`,
    );
  }
  if (countryRes.error) {
    throw new Error(
      `getRecentGroupActivity countries failed: ${countryRes.error.message}`,
    );
  }

  const actorById = new Map<string, string | null>();
  for (const a of actorRes.data ?? []) {
    actorById.set(a.user_id, a.display_name ?? null);
  }
  const countryByCode = new Map<string, string>();
  for (const c of countryRes.data ?? []) {
    countryByCode.set(c.code, c.name);
  }

  return visible.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    action: r.action,
    target_type: r.target_type,
    target_id: r.target_id,
    country_code: r.country_code,
    country_name: countryByCode.get(r.country_code) ?? null,
    actor_id: r.actor_id ?? null,
    actor_role: r.actor_role,
    actor_display_name: r.actor_id
      ? (actorById.get(r.actor_id) ?? null)
      : null,
  }));
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns a `{ field: { before, after } }` diff containing only changed
 * fields. Equality is the JS `===` operator (sufficient for primitives —
 * the audit log only ever diffs primitive lead columns: status, assigned_to,
 * call_attempts, first_contacted_at, last_outcome). Pass null/undefined
 * fields verbatim — they'll be compared and recorded if they changed.
 */
export function computeDiff<T extends Record<string, unknown>>(
  before: T,
  after: T,
): AuditDiff {
  const out: AuditDiff = {};
  const keys = new Set<keyof T>([
    ...(Object.keys(before) as Array<keyof T>),
    ...(Object.keys(after) as Array<keyof T>),
  ]);
  for (const key of keys) {
    if (before[key] !== after[key]) {
      out[String(key)] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return out;
}

/**
 * Hash an IP address with `IP_HASH_SALT` so we can correlate audit rows by
 * source without storing raw IPs (PII). Returns `undefined` for empty input
 * so callers can pass `req.headers.get('x-forwarded-for') ?? ''` without
 * extra null checks. Salt rotation breaks correlation across rotations by
 * design.
 */
export function hashIpAddress(ip: string): string | undefined {
  if (!ip || ip.trim().length === 0) return undefined;
  const salt = process.env.IP_HASH_SALT ?? '';
  // First entry of x-forwarded-for is the original client; the rest is the
  // proxy chain. Strip them so we hash a single address, not a chain.
  const first = ip.split(',')[0]!.trim();
  return createHash('sha256').update(first + salt).digest('hex');
}
