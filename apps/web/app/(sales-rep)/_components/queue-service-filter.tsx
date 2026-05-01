"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";

/**
 * Service-type filter — the 10 form slugs from migration 00004 (PRD-locked).
 * Hardcoded here because the list is stable and small; if it ever needs to
 * be dynamic, swap to a server-fetched list passed in as a prop.
 *
 * Empty value = "All services". The Select primitive can't bind to `null`,
 * so we use the sentinel string "all" and translate at the boundary.
 */

export const FORM_OPTIONS = [
  { slug: "general-contact", label: "General Contact" },
  { slug: "carrier-services", label: "Carrier Services" },
  { slug: "satellite", label: "Satellite" },
  { slug: "data-centers", label: "Data Centers" },
  { slug: "broadband", label: "Broadband" },
  { slug: "oneweb", label: "OneWeb" },
  { slug: "starlink", label: "Starlink" },
  { slug: "essential-access", label: "Essential Access" },
  { slug: "connect2care", label: "Connect2Care" },
  { slug: "starlink-for-schools", label: "Starlink for Schools" },
] as const;

const ALL_SENTINEL = "all";

interface QueueServiceFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function QueueServiceFilter({
  value,
  onChange,
}: QueueServiceFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold tracking-[0.06em] text-slate-500 uppercase">
        Service
      </label>
      <Select
        value={value ?? ALL_SENTINEL}
        onValueChange={(next) =>
          onChange(next === ALL_SENTINEL ? null : next)
        }
      >
        <SelectTrigger className="min-w-[180px]">
          <SelectValue placeholder="All services" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SENTINEL}>All services</SelectItem>
          {FORM_OPTIONS.map((opt) => (
            <SelectItem key={opt.slug} value={opt.slug}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function formLabelFor(slug: string): string {
  return FORM_OPTIONS.find((o) => o.slug === slug)?.label ?? slug;
}
