"use client";

import * as React from "react";
import { cn } from "../lib/utils";

type CallOutcome = "resolved" | "not_resolved" | "no_answer";

interface CallOutcomeModalProps {
  open: boolean;
  callbackName: string;
  onSubmit: (outcome: CallOutcome, notes: string) => void;
  onClose: () => void;
  loading?: boolean;
}

function CallOutcomeModal({
  open,
  callbackName,
  onSubmit,
  onClose,
  loading = false,
}: CallOutcomeModalProps) {
  const [outcome, setOutcome] = React.useState<CallOutcome | "">("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setOutcome("");
      setNotes("");
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    onSubmit(outcome, notes);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Complete Call</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">{callbackName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Call Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00468b] focus:border-transparent"
            >
              <option value="">Select outcome...</option>
              <option value="resolved">Resolved</option>
              <option value="not_resolved">Not Resolved</option>
              <option value="no_answer">No Answer</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about the call..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00468b] focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!outcome || loading}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
                outcome
                  ? "bg-[#00468b] text-white hover:bg-[#003670] cursor-pointer"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {loading ? "Saving..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
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
export type { CallOutcomeModalProps, CallOutcome };
