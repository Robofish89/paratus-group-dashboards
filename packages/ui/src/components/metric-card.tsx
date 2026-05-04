import { cn } from "../lib/utils";

/**
 * Single source of truth for the stat tiles used across the three
 * dashboards (sales-rep queue, country-admin overview, HQ overview).
 *
 * Two visual variants:
 *   - `ring` (default) — coloured ring around the card with the value text
 *     dyed to match. Locked as the canonical pattern in plan 04-04
 *     (cross-dashboard congruence wins; the queue-stats neighbour wins
 *     over the mockup's inset top-stripe).
 *   - `top-bar` — full-width accent stripe at the top of the card, neutral
 *     value text. Kept for surfaces that want the original mockup look or
 *     a non-domain accent (no current consumers as of plan 06-04 task 2).
 *
 * Accent → token map below covers the seven colour families used across
 * the three dashboards. Adding a new accent is one line per family.
 */

export type MetricCardVariant = "ring" | "top-bar";

export type MetricCardAccent =
  | "blue"
  | "orange"
  | "emerald"
  | "rose"
  | "slate"
  | "amber"
  | "violet";

export interface MetricCardDelta {
  /** Human-readable delta text, e.g. "+3%", "—", "new today". */
  text: string;
  tone: "up" | "down" | "flat";
}

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  /** Displayed as a small caption below the value when no `delta` is set. */
  subtext?: React.ReactNode;
  /** Trend chip below the value (overrides `subtext` when both present). */
  delta?: MetricCardDelta | null;
  accent?: MetricCardAccent;
  variant?: MetricCardVariant;
  /** Optional content slot below the headline (e.g. a sparkline). */
  children?: React.ReactNode;
  /** Spread additional `data-*` hooks (e.g. test ids, broadcast status). */
  dataAttrs?: Record<string, string>;
  className?: string;
}

const RING_CLASSES: Record<MetricCardAccent, string> = {
  blue: "ring-2 ring-blue-100",
  orange: "ring-2 ring-orange-100",
  emerald: "ring-2 ring-emerald-100",
  rose: "ring-2 ring-red-100",
  slate: "ring-2 ring-slate-200",
  amber: "ring-2 ring-amber-100",
  violet: "ring-2 ring-violet-100",
};

const VALUE_CLASSES: Record<MetricCardAccent, string> = {
  blue: "text-[#2B479B]",
  orange: "text-orange-500",
  emerald: "text-emerald-500",
  rose: "text-red-500",
  slate: "text-slate-700",
  amber: "text-amber-500",
  violet: "text-violet-500",
};

const TOP_BAR_CLASSES: Record<MetricCardAccent, string> = {
  blue: "bg-[#2B479B]",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  rose: "bg-red-500",
  slate: "bg-slate-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
};

const DELTA_TONE_CLASSES: Record<MetricCardDelta["tone"], string> = {
  up: "text-emerald-600",
  down: "text-red-500",
  flat: "text-slate-400",
};

function MetricCard({
  label,
  value,
  subtext,
  delta,
  accent = "blue",
  variant = "ring",
  children,
  dataAttrs,
  className,
}: MetricCardProps) {
  const isTopBar = variant === "top-bar";

  return (
    <div
      {...dataAttrs}
      className={cn(
        "bg-white rounded-xl px-4 py-3 sm:px-5 sm:py-4 border border-slate-200",
        "transition-shadow duration-200 hover:shadow-md relative overflow-hidden",
        isTopBar ? null : RING_CLASSES[accent],
        className,
      )}
    >
      {isTopBar && (
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-1",
            TOP_BAR_CLASSES[accent],
          )}
          aria-hidden
        />
      )}
      <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
        {label}
      </p>
      <p
        className={cn(
          "text-3xl font-bold tabular-nums",
          isTopBar ? "text-slate-900" : VALUE_CLASSES[accent],
        )}
      >
        {value}
      </p>
      {delta ? (
        <p className={cn("text-xs font-medium mt-1.5", DELTA_TONE_CLASSES[delta.tone])}>
          {delta.text}
        </p>
      ) : subtext !== undefined && subtext !== null ? (
        <p className="text-xs text-slate-400 mt-1.5">{subtext}</p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export { MetricCard };
