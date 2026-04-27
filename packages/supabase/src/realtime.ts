'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from './client';

export interface UseRealtimeSubscriptionOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  table: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  onPayload: (payload: RealtimePostgresChangesPayload<T>) => void;
}

/**
 * Subscribe to Supabase Realtime postgres_changes for a given table.
 * Runs in the browser only — do NOT import from server components.
 */
export function useRealtimeSubscription<T extends Record<string, unknown> = Record<string, unknown>>({
  table,
  schema = 'public',
  event = '*',
  onPayload,
}: UseRealtimeSubscriptionOptions<T>) {
  // Keep a stable ref for onPayload to avoid re-subscribing on every render
  const callbackRef = useRef(onPayload);
  callbackRef.current = onPayload;

  useEffect(() => {
    const supabase = createClient();
    const channelName = `realtime-${schema}-${table}-${event}`;

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        { event, schema, table },
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, schema, event]);
}
