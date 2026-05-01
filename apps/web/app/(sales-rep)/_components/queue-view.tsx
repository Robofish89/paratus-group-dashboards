"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueueLead } from "@repo/supabase/dal";
import { useAgentBroadcast } from "./use-agent-broadcast";
import { QueueStats, type QueueStatsData } from "./queue-stats";
import { QueueTabs, type QueueTabKey } from "./queue-tabs";
import { QueueServiceFilter } from "./queue-service-filter";
import { QueueCard } from "./queue-card";

/**
 * Client wrapper for the agent queue. Owns:
 *   - the To Call / Completed lists (seeded from server, mutated by realtime)
 *   - the active tab + service filter
 *   - the per-lead "fresh" flash (4s, then auto-clears)
 *
 * Realtime contract — see use-agent-broadcast.ts. The trigger fires on
 * INSERT (with assigned_to set) or UPDATE OF assigned_to. The webhook path
 * always lands as UPDATE because assign_lead flips assigned_to from NULL.
 *
 * Stats stay authoritative from the server fetch — we don't re-derive on the
 * client because to_call_count counts cross-status (new + contacted) and the
 * realtime stream only carries individual lead rows. Plan 03-03 will refresh
 * stats via router.refresh() when a call completes; for now stats only move
 * when a fresh assignment lands (we bump to_call_count by one).
 */

const FRESH_FLASH_MS = 4000;

interface QueueViewProps {
  agentId: string;
  initialQueue: QueueLead[];
  initialCompleted: QueueLead[];
  initialStats: QueueStatsData | null;
  /** Empty-state copy when an HQ admin observes an agent-route. */
  observerNotice?: string;
}

function upsertSorted(prev: QueueLead[], lead: QueueLead): QueueLead[] {
  // Replace if the id already exists; otherwise prepend (newest first in the
  // queue ordering for fresh arrivals — DAL's getAgentQueue orders ascending
  // by submitted_at for the initial fetch, but new arrivals naturally belong
  // at the top of the agent's attention).
  const existingIdx = prev.findIndex((l) => l.id === lead.id);
  if (existingIdx >= 0) {
    const next = prev.slice();
    next[existingIdx] = lead;
    return next;
  }
  return [lead, ...prev];
}

export function QueueView({
  agentId,
  initialQueue,
  initialCompleted,
  initialStats,
  observerNotice,
}: QueueViewProps) {
  const [queue, setQueue] = useState<QueueLead[]>(initialQueue);
  const [completed, setCompleted] = useState<QueueLead[]>(initialCompleted);
  const [stats, setStats] = useState<QueueStatsData | null>(initialStats);
  const [tab, setTab] = useState<QueueTabKey>("to_call");
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  // Track which ids are already known so the broadcast handler can decide
  // whether the lead is "new to me" (bump counter) or just an update.
  const knownIdsRef = useRef<Set<string>>(
    new Set([
      ...initialQueue.map((l) => l.id),
      ...initialCompleted.map((l) => l.id),
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

  useAgentBroadcast(agentId, (lead) => {
    const isNew = !knownIdsRef.current.has(lead.id);
    knownIdsRef.current.add(lead.id);

    // Route the row into the right list based on its terminal status.
    const isTerminal =
      lead.status === "qualified" ||
      lead.status === "converted" ||
      lead.status === "lost";

    if (isTerminal) {
      setCompleted((prev) => upsertSorted(prev, lead));
      // If it was previously in the active queue, drop it.
      setQueue((prev) => prev.filter((l) => l.id !== lead.id));
    } else {
      setQueue((prev) => upsertSorted(prev, lead));
      if (isNew) {
        setStats((s) =>
          s
            ? { ...s, to_call_count: (s.to_call_count ?? 0) + 1 }
            : {
                to_call_count: 1,
                completed_today: 0,
                converted_today: 0,
                callbacks_pending: 0,
              },
        );
      }
    }

    if (isNew) markFresh(lead.id);
  });

  // Cleanup the fresh-id timers on unmount — leak guard.
  useEffect(() => {
    return () => {
      setFreshIds(new Set());
    };
  }, []);

  const visible = tab === "to_call" ? queue : completed;
  const filtered = useMemo(
    () =>
      serviceFilter
        ? visible.filter((l) => l.form_slug === serviceFilter)
        : visible,
    [visible, serviceFilter],
  );

  return (
    <div className="space-y-6">
      <QueueStats stats={stats} />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <QueueTabs
          tab={tab}
          onChange={setTab}
          toCallCount={queue.length}
          completedCount={completed.length}
        />
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

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((lead) => (
            <QueueCard
              key={lead.id}
              lead={lead}
              fresh={freshIds.has(lead.id)}
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
  const headline =
    tab === "to_call"
      ? hasFilter
        ? "No leads match this service filter."
        : "Nothing in your queue right now."
      : hasFilter
        ? "No completed calls match this service filter."
        : "No completed calls today yet.";

  const sub =
    tab === "to_call"
      ? "New leads land here automatically — no refresh needed."
      : "Calls you wrap up today will appear here.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{headline}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
