"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Phase 3 Sales-Rep call-outcome modal.
 *
 * Replaces the original AMA-mirrored stub which only supported three outcomes.
 * Visual contract: docs/design-reference/sales-rep-dashboard.html lines 324-383.
 *
 * Five outcomes (PRD/features.md):
 *   - qualified  → lead status flips to 'qualified'
 *   - won        → lead status flips to 'converted'
 *   - lost       → lead status flips to 'lost' (lost_reason required)
 *   - no_answer  → event-only, lead stays in queue
 *   - callback   → callback row inserted (callback_at required)
 *
 * The parent owns submission. The modal validates inputs, surfaces inline
 * errors on validation failure, and delegates the RPC call to onSubmit. On
 * thrown errors, the parent's promise rejection is caught and the error
 * surface stays visible without closing the modal.
 */

export type CallOutcome =
  | "qualified"
  | "won"
  | "lost"
  | "no_answer"
  | "callback";

export interface CallOutcomeModalSubmit {
  outcome: CallOutcome;
  notes?: string;
  lost_reason?: string;
  /** ISO 8601 string. Required when outcome === 'callback'. */
  callback_at?: string;
}

export interface CallOutcomeModalProps {
  open: boolean;
  lead: { id: string; name: string };
  onSubmit: (input: CallOutcomeModalSubmit) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const OUTCOME_OPTIONS: Array<{ value: CallOutcome; label: string }> = [
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "no_answer", label: "No Answer" },
  { value: "callback", label: "Callback" },
];

/**
 * Returns the value for a `<input type="datetime-local">` `min` attribute,
 * formatted to the user's local clock. The picker reads this as a wall-clock
 * comparison — passing a UTC-formatted string would mis-bound users in
 * non-UTC timezones.
 */
function localNowMin(): string {
  const d = new Date();
  // YYYY-MM-DDTHH:MM (local) — slice off the seconds + tz offset.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CallOutcomeModal({
  open,
  lead,
  onSubmit,
  onClose,
  loading = false,
}: CallOutcomeModalProps) {
  const [outcome, setOutcome] = React.useState<CallOutcome | "">("");
  const [notes, setNotes] = React.useState("");
  const [lostReason, setLostReason] = React.useState("");
  const [callbackAt, setCallbackAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when the modal opens for a new lead.
  React.useEffect(() => {
    if (open) {
      setOutcome("");
      setNotes("");
      setLostReason("");
      setCallbackAt("");
      setError(null);
    }
  }, [open, lead.id]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!outcome) {
      setError("Pick an outcome before submitting.");
      return;
    }

    if (outcome === "lost" && !lostReason.trim()) {
      setError("Lost reason is required when outcome is Lost.");
      return;
    }

    let callbackIso: string | undefined;
    if (outcome === "callback") {
      if (!callbackAt) {
        setError("Pick a callback date and time.");
        return;
      }
      const cbDate = new Date(callbackAt);
      if (Number.isNaN(cbDate.getTime())) {
        setError("Invalid callback date.");
        return;
      }
      if (cbDate.getTime() <= Date.now()) {
        setError("Callback time must be in the future.");
        return;
      }
      callbackIso = cbDate.toISOString();
    }

    const payload: CallOutcomeModalSubmit = {
      outcome,
      notes: notes.trim() ? notes.trim() : undefined,
      lost_reason:
        outcome === "lost" && lostReason.trim()
          ? lostReason.trim()
          : undefined,
      callback_at: callbackIso,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  const submitDisabled =
    !outcome ||
    loading ||
    (outcome === "lost" && !lostReason.trim()) ||
    (outcome === "callback" && !callbackAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-outcome-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/60"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2
              id="call-outcome-title"
              className="text-lg font-bold text-slate-900"
            >
              Complete Call
            </h2>
            <p className="text-[13px] text-slate-500 mt-0.5">{lead.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="call-outcome-select"
              className="block text-[13px] font-semibold text-slate-700 mb-1.5"
            >
              Call Outcome
            </label>
            <select
              id="call-outcome-select"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}
              required
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2B479B] focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
            >
              <option value="">Select outcome...</option>
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {outcome === "lost" && (
            <div>
              <label
                htmlFor="call-outcome-lost-reason"
                className="block text-[13px] font-semibold text-slate-700 mb-1.5"
              >
                Lost Reason
              </label>
              <input
                id="call-outcome-lost-reason"
                type="text"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g. no budget, chose competitor, out of coverage"
                required
                disabled={loading}
                maxLength={500}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2B479B] focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {outcome === "callback" && (
            <div>
              <label
                htmlFor="call-outcome-callback-at"
                className="block text-[13px] font-semibold text-slate-700 mb-1.5"
              >
                Callback Date &amp; Time
              </label>
              <input
                id="call-outcome-callback-at"
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                min={localNowMin()}
                required
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2B479B] focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="call-outcome-notes"
              className="block text-[13px] font-semibold text-slate-700 mb-1.5"
            >
              Notes
            </label>
            <textarea
              id="call-outcome-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about the call..."
              rows={4}
              disabled={loading}
              maxLength={2000}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2B479B] focus:border-transparent resize-none disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitDisabled}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
                submitDisabled
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#2B479B] text-white hover:bg-[#243d85] cursor-pointer",
              )}
            >
              {loading ? "Saving…" : "Submit"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { CallOutcomeModal };
