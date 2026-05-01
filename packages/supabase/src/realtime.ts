'use client';

import { useEffect, useRef } from 'react';
import { createClient } from './client';

/**
 * Broadcast-from-Database client hook.
 *
 * Phase 2 (migration 00008) wired the leads table to Supabase Realtime via
 * Broadcast-from-Database — NOT postgres_changes — and added 3 RLS policies
 * on `realtime.messages` that gate subscribes by topic name + caller role:
 *   - `agent:<uid>`     → only that agent (or hq_admin)
 *   - `country:<code>`  → only country_admin of that country (or hq_admin)
 *
 * To pass that gate the channel MUST be opened with `private: true`. This hook
 * encodes that requirement so callers can't accidentally drop it.
 *
 * Plan 03-02 — agent queue subscribes via the typed wrapper at
 * `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts`. Plan 04-*
 * country admin will reuse this generic hook with `topic: country:<code>`.
 */

export type BroadcastEnvelope<T = Record<string, unknown>> = {
  event: string;
  payload?: {
    record?: T;
    old_record?: T;
    operation?: string;
  };
};

export type BroadcastStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export interface UsePrivateBroadcastOptions<T> {
  /** Channel topic, e.g. `agent:${userId}` or `country:${code}`. */
  topic: string;
  /** Filter to a single TG_OP, or `'*'` for all. Default `'*'`. */
  event?: string;
  onMessage: (env: BroadcastEnvelope<T>) => void;
  onStatusChange?: (status: BroadcastStatus) => void;
}

/**
 * Subscribe to a private Supabase Realtime broadcast channel.
 *
 * Stable across re-renders: the latest `onMessage` / `onStatusChange` is held
 * in a ref so the channel is NOT torn down when the parent re-renders. The
 * subscription only re-subscribes when `topic` or `event` changes.
 */
export function usePrivateBroadcast<T = Record<string, unknown>>({
  topic,
  event = '*',
  onMessage,
  onStatusChange,
}: UsePrivateBroadcastOptions<T>) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(topic, { config: { private: true } });

    channel.on('broadcast', { event }, (msg) =>
      onMessageRef.current(msg as BroadcastEnvelope<T>),
    );
    channel.subscribe((status) => {
      onStatusRef.current?.(status as BroadcastStatus);
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [topic, event]);
}
