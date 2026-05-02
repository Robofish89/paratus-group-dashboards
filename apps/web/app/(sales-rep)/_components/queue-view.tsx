"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueLead } from "@repo/supabase/dal";
import type { BroadcastStatus } from "@repo/supabase/realtime";
import type { DateRangeKey } from "@/app/_lib/date-range";
import { useAgentBroadcast } from "./use-agent-broadcast";
import {
  QueueStats,
  type QueueStatsLiveData,
  type QueueStatsRangeData,
} from "./queue-stats";
import { QueueTabs, type QueueTabKey } from "./queue-tabs";
import { QueueServiceFilter } from "./queue-service-filter";
import { QueueCard } from "./queue-card";

/**
 * Plan-03-04 client view. Owns:
 *   - the four lists (To Call / Follow-ups / Converted / Lost)
 *   - the active tab + service filter + range key (for display)
 *   - the per-lead "fresh" flash (4s)
 *   - the inline call → outcome / lost / callback / no-answer handlers,
 *     all firing against the queue route handlers
 *
 * Server is authoritative on stats — `router.refresh()` after every mutation
 * re-fetches the agent_today_stats view + agent_stats_in_range RPC. The
 * realtime broadcast updates the lead lists optimistically.
 *
 * Range stats are server-computed and passed as `initialRange*` props; this
 * component does NOT recompute them on the client. The DateRangePicker
 * inside QueueStats updates the URL → server re-renders → fresh props
 * arrive on the next render.
 */

const FRESH_FLASH_MS = 4000;

interface QueueViewProps {
  agentId: string;
  initialToCall: QueueLead[];
  initialFollowUps: QueueLead[];
  initialConverted: QueueLead[];
  initialLost: QueueLead[];
  /** Lead-id set of leads that carry a future-scheduled callback. */
  futureCallbackLeadIds: string[];
  liveStats: QueueStatsLiveData;
  rangeStats: QueueStatsRangeData;
  rangeKey: DateRangeKey;
  rangeLabel: string;
  observerNotice?: string;
}

type ListKey = "to_call" | "follow_ups" | "converted" | "lost";

function classifyLead(
  lead: QueueLead,
  futureCallbackIds: Set<string>,
): ListKey {
  if (lead.status === "converted") return "converted";
  if (lead.status === "lost") return "lost";
  // Stalled no-answers route to Follow-ups.
  if (
    lead.status === "contacted" &&
    lead.last_outcome === "no_answer" &&
    lead.call_attempts >= 3
  ) {
    return "follow_ups";
  }
  // Future callback also routes to Follow-ups.
  if (futureCallbackIds.has(lead.id)) return "follow_ups";
  return "to_call";
}

function upsertSorted(prev: QueueLead[], lead: QueueLead): QueueLead[] {
  const idx = prev.findIndex((l) => l.id === lead.id);
  if (idx >= 0) {
    const next = prev.slice();
    next[idx] = lead;
    return next;
  }
  return [lead, ...prev];
}

function removeById(list: QueueLead[], id: string): QueueLead[] {
  return list.filter((l) => l.id !== id);
}

export function QueueView({
  agentId,
  initialToCall,
  initialFollowUps,
  initialConverted,
  initialLost,
  futureCallbackLeadIds,
  liveStats,
  rangeStats,
  rangeKey,
  rangeLabel,
  observerNotice,
}: QueueViewProps) {
  const router = useRouter();
  const [toCall, setToCall] = useState<QueueLead[]>(initialToCall);
  const [followUps, setFollowUps] = useState<QueueLead[]>(initialFollowUps);
  const [converted, setConverted] = useState<QueueLead[]>(initialConverted);
  const [lost, setLost] = useState<QueueLead[]>(initialLost);
  const [tab, setTab] = useState<QueueTabKey>("to_call");
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<BroadcastStatus | "idle">(
    "idle",
  );

  const futureCallbackIds = useMemo(
    () => new Set(futureCallbackLeadIds),
    [futureCallbackLeadIds],
  );

  // Tracks which ids are already known so the broadcast handler can flag
  // arrivals as fresh.
  const knownIdsRef = useRef<Set<string>>(
    new Set([
      ...initialToCall.map((l) => l.id),
      ...initialFollowUps.map((l) => l.id),
      ...initialConverted.map((l) => l.id),
      ...initialLost.map((l) => l.id),
    ]),
  );

  const markFresh = useCallback((id: string) => {
    setFreshIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setFreshIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, FRESH_FLASH_MS);
  }, []);

  /**
   * Route a freshly-broadcast lead into the right list and remove it from
   * any other list it might have been in (state transitions).
   */
  const routeLead = useCallback(
    (lead: QueueLead) => {
      const target = classifyLead(lead, futureCallbackIds);
      // Remove from the three non-target lists, upsert into the target.
      if (target !== "to_call") setToCall((p) => removeById(p, lead.id));
      if (target !== "follow_ups") setFollowUps((p) => removeById(p, lead.id));
      if (target !== "converted") setConverted((p) => removeById(p, lead.id));
      if (target !== "lost") setLost((p) => removeById(p, lead.id));
      const setter =
        target === "to_call"
          ? setToCall
          : target === "follow_ups"
            ? setFollowUps
            : target === "converted"
              ? setConverted
              : setLost;
      setter((p) => upsertSorted(p, lead));
    },
    [futureCallbackIds],
  );

  useAgentBroadcast(
    agentId,
    (lead) => {
      const isNew = !knownIdsRef.current.has(lead.id);
      knownIdsRef.current.add(lead.id);
      routeLead(lead);
      if (isNew) markFresh(lead.id);
    },
    setRealtimeStatus,
  );

  // ─── Network handlers ────────────────────────────────────────────────────

  const handleCall = useCallback(async (lead: QueueLead) => {
    setBusyLeadId(lead.id);
    setCallError(null);
    try {
      const res = await fetch("/api/queue/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Call failed (${res.status})`,
        );
      }
      const result = (await res.json()) as {
        lead_id: string;
        first_contacted_at: string;
      };
      // Optimistic flip — server-truth lands via realtime within a beat.
      const updated: QueueLead = {
        ...lead,
        status: "contacted",
        first_contacted_at: result.first_contacted_at,
        last_outcome: "connected",
      };
      setToCall((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
      setFollowUps((prev) =>
        prev.map((l) => (l.id === lead.id ? updated : l)),
      );
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Call failed.");
    } finally {
      setBusyLeadId(null);
    }
  }, []);

  const handleConverted = useCallback(
    async (lead: QueueLead) => {
      setBusyLeadId(lead.id);
      setCallError(null);
      try {
        const res = await fetch("/api/queue/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: lead.id, outcome: "won" }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: unknown }
            | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `Submit failed (${res.status})`,
          );
        }
        // Optimistic move into Converted; realtime/refresh re-syncs.
        const finished: QueueLead = { ...lead, status: "converted" };
        setToCall((p) => removeById(p, lead.id));
        setFollowUps((p) => removeById(p, lead.id));
        setConverted((p) => upsertSorted(p, finished));
        router.refresh();
      } catch (err) {
        setCallError(err instanceof Error ? err.message : "Submit failed.");
      } finally {
        setBusyLeadId(null);
      }
    },
    [router],
  );

  const handleLost = useCallback(
    async (lead: QueueLead, reason: string | undefined) => {
      setBusyLeadId(lead.id);
      setCallError(null);
      try {
        const res = await fetch("/api/queue/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: lead.id,
            outcome: "lost",
            lost_reason: reason ?? "unspecified",
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: unknown }
            | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `Submit failed (${res.status})`,
          );
        }
        const finished: QueueLead = {
          ...lead,
          status: "lost",
          lost_reason: reason ?? null,
        };
        setToCall((p) => removeById(p, lead.id));
        setFollowUps((p) => removeById(p, lead.id));
        setLost((p) => upsertSorted(p, finished));
        router.refresh();
      } catch (err) {
        setCallError(err instanceof Error ? err.message : "Submit failed.");
      } finally {
        setBusyLeadId(null);
      }
    },
    [router],
  );

  const handleCallback = useCallback(
    async (lead: QueueLead, scheduledForIso: string) => {
      setBusyLeadId(lead.id);
      setCallError(null);
      try {
        const res = await fetch("/api/queue/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: lead.id,
            scheduled_for: scheduledForIso,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: unknown }
            | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `Schedule failed (${res.status})`,
          );
        }
        // Future callbacks live in Follow-ups; move there.
        setToCall((p) => removeById(p, lead.id));
        setFollowUps((p) => upsertSorted(p, lead));
        router.refresh();
      } catch (err) {
        setCallError(
          err instanceof Error ? err.message : "Schedule failed.",
        );
      } finally {
        setBusyLeadId(null);
      }
    },
    [router],
  );

  const handleNoAnswer = useCallback(
    async (lead: QueueLead) => {
      setBusyLeadId(lead.id);
      setCallError(null);
      try {
        const res = await fetch("/api/queue/no-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: lead.id }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: unknown }
            | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `No-answer failed (${res.status})`,
          );
        }
        const result = (await res.json()) as {
          lead_id: string;
          call_attempts: number;
        };
        const updated: QueueLead = {
          ...lead,
          last_outcome: "no_answer",
          call_attempts: result.call_attempts,
        };
        // 3rd no-answer flips to Follow-ups; otherwise stay in current list.
        if (result.call_attempts >= 3) {
          setToCall((p) => removeById(p, lead.id));
          setFollowUps((p) => upsertSorted(p, updated));
        } else {
          setToCall((p) =>
            p.map((l) => (l.id === lead.id ? updated : l)),
          );
          setFollowUps((p) =>
            p.map((l) => (l.id === lead.id ? updated : l)),
          );
        }
        router.refresh();
      } catch (err) {
        setCallError(
          err instanceof Error ? err.message : "No-answer failed.",
        );
      } finally {
        setBusyLeadId(null);
      }
    },
    [router],
  );

  // ─── Derived render data ─────────────────────────────────────────────────

  const visible = useMemo(() => {
    switch (tab) {
      case "to_call":
        return toCall;
      case "follow_ups":
        return followUps;
      case "converted":
        return converted;
      case "lost":
        return lost;
    }
  }, [tab, toCall, followUps, converted, lost]);

  const filtered = useMemo(
    () =>
      serviceFilter
        ? visible.filter((l) => l.form_slug === serviceFilter)
        : visible,
    [visible, serviceFilter],
  );

  const counts: Record<QueueTabKey, number> = {
    to_call: toCall.length,
    follow_ups: followUps.length,
    converted: converted.length,
    lost: lost.length,
  };

  return (
    <div
      className="space-y-6"
      data-testid="queue-view"
      data-realtime-status={realtimeStatus}
    >
      <QueueStats
        live={liveStats}
        range={rangeStats}
        rangeKey={rangeKey}
        rangeLabel={rangeLabel}
      />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <QueueTabs tab={tab} onChange={setTab} counts={counts} />
        <QueueServiceFilter
          value={serviceFilter}
          onChange={setServiceFilter}
        />
      </div>

      {observerNotice && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          {observerNotice}
        </div>
      )}

      {callError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700"
        >
          {callError}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((lead) => (
            <QueueCard
              key={lead.id}
              lead={lead}
              fresh={freshIds.has(lead.id)}
              busy={busyLeadId === lead.id}
              hasFutureCallback={futureCallbackIds.has(lead.id)}
              onCall={handleCall}
              onConverted={handleConverted}
              onLost={handleLost}
              onCallback={handleCallback}
              onNoAnswer={handleNoAnswer}
            />
          ))}
        </div>
      ) : (
        <EmptyState tab={tab} hasFilter={!!serviceFilter} />
      )}
    </div>
  );
}

function EmptyState({
  tab,
  hasFilter,
}: {
  tab: QueueTabKey;
  hasFilter: boolean;
}) {
  const HEADLINES: Record<QueueTabKey, string> = {
    to_call: hasFilter
      ? "No leads match this service filter."
      : "Nothing in your queue right now.",
    follow_ups: hasFilter
      ? "No follow-ups match this service filter."
      : "No follow-ups waiting.",
    converted: hasFilter
      ? "No conversions match this service filter."
      : "No conversions in this range yet.",
    lost: hasFilter
      ? "No lost leads match this service filter."
      : "No lost leads in this range.",
  };

  const SUBS: Record<QueueTabKey, string> = {
    to_call: "New leads land here automatically — no refresh needed.",
    follow_ups: "Future callbacks + stalled no-answers show up here.",
    converted: "Pick a different range to see older conversions.",
    lost: "Pick a different range to see older losses.",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{HEADLINES[tab]}</p>
      <p className="mt-1 text-xs text-slate-500">{SUBS[tab]}</p>
    </div>
  );
}
