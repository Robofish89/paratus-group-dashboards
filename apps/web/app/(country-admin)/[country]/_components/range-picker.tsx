"use client";

import { DateRangePicker } from "@/app/(sales-rep)/_components/date-range-picker";
import type { DateRangeKey } from "@/app/_lib/date-range";

/**
 * Range picker for the country-admin overview header (plan 06-04 task 3).
 *
 * Phase 4 plan 04-03 wired the URL contract `?range=today|week|month|custom`
 * (+ `?from`/`?to`) on the country-admin overview but deferred the picker
 * UI itself. Phase 6 closes the gap.
 *
 * The sales-rep `<DateRangePicker />` is route-agnostic (relative-URL
 * router.replace, shared `parseRangeParams` helper from
 * `apps/web/app/_lib/date-range.ts`) so the country-admin surface re-uses
 * it as-is — the import is a deliberate cross-route reuse, not a layering
 * accident.
 *
 * If a country-admin-specific behaviour ever diverges (e.g. presets), this
 * wrapper is the seam to fork from.
 */
export function RangePicker({
  rangeKey,
  rangeLabel,
}: {
  rangeKey: DateRangeKey;
  rangeLabel: string;
}) {
  return <DateRangePicker currentKey={rangeKey} currentLabel={rangeLabel} />;
}
