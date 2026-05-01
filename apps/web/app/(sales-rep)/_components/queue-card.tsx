"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, Globe } from "lucide-react";
import { Badge, cn } from "@repo/ui";
import type { QueueLead } from "@repo/supabase/dal";
import { formLabelFor } from "./queue-service-filter";

/**
 * Single lead card — pixel-matched to mockup lines 111–144 plus an SLA dot
 * (top-left) that the design reference implies but doesn't render.
 *
 * `data-fresh="true"` triggers a 4-second emerald flash; the parent toggles
 * it off after 4s. The transition is gentle — no strobe.
 */

interface QueueCardProps {
  lead: QueueLead;
  /** True when this card just arrived via realtime — flashes for 4s. */
  fresh?: boolean;
  /** Click handler for the Call Now button — wired by the parent. */
  onCallNow: (lead: QueueLead) => void;
  /** True while the Call Now POST or modal submit is in flight. */
  busy?: boolean;
}

const FORM_BADGE_CLASS = "bg-blue-50 text-blue-700 border border-blue-200";

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${month} ${year}, ${time}`;
}

type SlaState = {
  tone: "red" | "amber" | "green" | "grey";
  label: string;
};

/**
 * SLA dot logic — re-evaluated locally on a 30-second tick so dots age in
 * place. Once status flips to 'contacted' the dot greys out permanently.
 *   - red:   > 5 min uncontacted
 *   - amber: 2-5 min uncontacted
 *   - green: < 2 min uncontacted
 *   - grey:  contacted (or any non-new status)
 */
function computeSlaState(lead: QueueLead, now: number): SlaState {
  if (lead.status !== "new" || lead.first_contacted_at) {
    return { tone: "grey", label: "Contacted" };
  }
  const ageMs = now - new Date(lead.submitted_at).getTime();
  const ageMin = Math.max(0, Math.round(ageMs / 60_000));
  if (ageMs > 5 * 60_000) {
    return {
      tone: "red",
      label: `SLA: ${ageMin} minutes — over target`,
    };
  }
  if (ageMs > 2 * 60_000) {
    return {
      tone: "amber",
      label: `SLA: ${ageMin} minutes — approaching target`,
    };
  }
  return {
    tone: "green",
    label: `SLA: ${ageMin} minutes — within target`,
  };
}

const SLA_DOT_CLASS: Record<SlaState["tone"], string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  grey: "bg-slate-300",
};

export function QueueCard({
  lead,
  fresh = false,
  onCallNow,
  busy = false,
}: QueueCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const sla = computeSlaState(lead, now);

  return (
    <div
      data-fresh={fresh ? "true" : undefined}
      className={cn(
        "relative bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5",
        "flex flex-col hover:shadow-md transition-all duration-500",
        "data-[fresh=true]:bg-emerald-50/40 data-[fresh=true]:border-emerald-200",
      )}
    >
      {/* SLA dot — top-left, 6px. */}
      <span
        aria-label={sla.label}
        className={cn(
          "absolute top-3 left-3 inline-block w-1.5 h-1.5 rounded-full",
          SLA_DOT_CLASS[sla.tone],
        )}
      />

      <div className="flex items-start justify-between gap-3 mb-3 pl-3">
        <h3 className="text-base font-bold text-slate-900 truncate">
          {lead.name}
        </h3>
        <Badge
          variant="outline"
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
            FORM_BADGE_CLASS,
          )}
        >
          {formLabelFor(lead.form_slug)}
        </Badge>
      </div>

      <div className="space-y-2 flex-1">
        {lead.phone && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={1.5} />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={1.5} />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={1.5} />
          <span className="truncate">{formLabelFor(lead.form_slug)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3 mb-4">
        {formatSubmittedAt(lead.submitted_at)}
      </p>

      <button
        type="button"
        data-action="call-lead"
        data-lead-id={lead.id}
        disabled={busy}
        onClick={() => onCallNow(lead)}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
          "bg-emerald-50 text-emerald-700 border border-emerald-200",
          "hover:bg-emerald-100 cursor-pointer transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <Phone className="w-4 h-4" strokeWidth={2} />
        {busy ? "Connecting…" : "Call Now"}
      </button>
    </div>
  );
}
