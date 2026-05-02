/**
 * Date-range helpers for the sales-rep queue stats strip + Converted/Lost
 * tab lists. Pure functions — safe to call from server components AND
 * client components.
 *
 * URL contract:
 *   ?range=today | week | month | custom
 *   ?from=YYYY-MM-DD          (only when range=custom)
 *   ?to=YYYY-MM-DD            (only when range=custom)
 *
 * Returned bounds are half-open `[from, to)` so they nest into the
 * `agent_stats_in_range` RPC unchanged.
 */

export type DateRangeKey = "today" | "week" | "month" | "custom";

export interface DateRange {
  key: DateRangeKey;
  from: Date;
  to: Date;
  /** Human-readable label for the stats strip caption. */
  label: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfNextDay(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + 1);
  return out;
}

/**
 * Monday as the start of the week (ISO 8601 + matches the agent's mental
 * model — a "this week" tile shouldn't reset on Sunday).
 */
function startOfWeekMonday(d: Date): Date {
  const out = startOfDay(d);
  // 0 = Sunday, 1 = Monday … shift Sunday to be 7 so subtraction lands on Mon.
  const day = out.getDay() === 0 ? 7 : out.getDay();
  out.setDate(out.getDate() - (day - 1));
  return out;
}

function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

function startOfNextMonth(d: Date): Date {
  const out = startOfMonth(d);
  out.setMonth(out.getMonth() + 1);
  return out;
}

function parseIsoDate(s: string | undefined): Date | null {
  if (!s || !ISO_DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Resolves URL search params into a concrete `[from, to)` window. Falls back
 * to "today" on missing or invalid input — a malformed `?range=` should never
 * crash the page.
 */
export function resolveDateRange(params: {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): DateRange {
  const rangeRaw = Array.isArray(params.range) ? params.range[0] : params.range;
  const fromRaw = Array.isArray(params.from) ? params.from[0] : params.from;
  const toRaw = Array.isArray(params.to) ? params.to[0] : params.to;

  const now = new Date();

  if (rangeRaw === "custom") {
    const from = parseIsoDate(fromRaw);
    const to = parseIsoDate(toRaw);
    if (from && to && to >= from) {
      const toEnd = startOfNextDay(to);
      return {
        key: "custom",
        from: startOfDay(from),
        to: toEnd,
        label: `${fmtMonthDay(from)} – ${fmtMonthDay(to)}`,
      };
    }
    // Bad custom range → fall through to today (visible recovery).
  }

  if (rangeRaw === "week") {
    const from = startOfWeekMonday(now);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { key: "week", from, to, label: "this week" };
  }

  if (rangeRaw === "month") {
    return {
      key: "month",
      from: startOfMonth(now),
      to: startOfNextMonth(now),
      label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }

  // Default: today.
  return {
    key: "today",
    from: startOfDay(now),
    to: startOfNextDay(now),
    label: "today",
  };
}

/**
 * Builds a URL query string fragment for a given range. Used by the picker
 * to wire `router.replace`.
 */
export function buildRangeQuery(input: {
  key: DateRangeKey;
  from?: Date;
  to?: Date;
}): string {
  const sp = new URLSearchParams();
  sp.set("range", input.key);
  if (input.key === "custom" && input.from && input.to) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    sp.set("from", iso(input.from));
    sp.set("to", iso(input.to));
  }
  return sp.toString();
}
