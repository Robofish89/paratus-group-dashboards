"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";

/**
 * Reassign-lead dialog (plan 04-03). Posts to /api/country-admin/reassign and
 * surfaces typed errors via toast + inline message. The agent dropdown is
 * pre-filtered to the lead's country (by getCountryAgents on the server),
 * and the SECURITY DEFINER RPC's cross-country guard backstops it — no
 * client-side cross-country check.
 */

interface ReassignDialogProps {
  lead: {
    id: string;
    name: string;
    current_assignee_id: string | null;
    current_assignee_name: string | null;
  };
  agents: Array<{ user_id: string; display_name: string }>;
  onClose: () => void;
  onReassigned: () => void;
}

export function ReassignDialog({
  lead,
  agents,
  onClose,
  onReassigned,
}: ReassignDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Pre-filter the dropdown so the current assignee can't be re-picked. If
  // there's no other agent to pick, the Save button stays disabled.
  const pickableAgents = agents.filter(
    (a) => a.user_id !== lead.current_assignee_id,
  );

  async function handleSave() {
    if (!selectedAgent) return;
    setSubmitting(true);
    setInlineError(null);

    try {
      const res = await fetch("/api/country-admin/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          to_agent_id: selectedAgent,
        }),
      });

      if (res.status === 204) {
        toast.success(`Lead reassigned to ${nameOf(pickableAgents, selectedAgent)}`);
        onReassigned();
        return;
      }

      if (res.status === 403) {
        setInlineError("You don't have permission to reassign this lead.");
        return;
      }
      if (res.status === 404) {
        setInlineError("Lead no longer exists.");
        return;
      }
      // 400 / 500 / unexpected
      const detail = await res.text().catch(() => "");
      setInlineError(detail || "Couldn't reassign. Try again.");
      toast.error("Couldn't reassign. Try again.");
    } catch {
      setInlineError("Network error. Try again.");
      toast.error("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
    >
      <DialogContent data-testid="reassign-dialog">
        <DialogHeader>
          <DialogTitle>Reassign {lead.name}</DialogTitle>
          <DialogDescription>
            Currently assigned to{" "}
            <span className="font-medium text-slate-700">
              {lead.current_assignee_name ?? "no one"}
            </span>
            . Pick the agent who should take over.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="reassign-agent"
            className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase"
          >
            Reassign to
          </label>
          <Select
            value={selectedAgent ?? undefined}
            onValueChange={setSelectedAgent}
          >
            <SelectTrigger id="reassign-agent" className="w-full">
              <SelectValue placeholder="Select an agent…" />
            </SelectTrigger>
            <SelectContent>
              {pickableAgents.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-slate-400">
                  No other agents in this country.
                </div>
              ) : (
                pickableAgents.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {a.display_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {inlineError && (
            <p className="text-xs text-rose-600 mt-1">{inlineError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedAgent || submitting}
            className="bg-[#2B479B] hover:bg-[#243d85] text-white"
            data-testid="reassign-dialog-save"
          >
            {submitting ? "Reassigning…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function nameOf(
  agents: Array<{ user_id: string; display_name: string }>,
  id: string,
): string {
  return agents.find((a) => a.user_id === id)?.display_name ?? "agent";
}
