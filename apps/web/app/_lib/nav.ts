import type { NavItem } from "@repo/ui";
import {
  BarChart3,
  Filter,
  LayoutDashboard,
  Phone,
  ScrollText,
  Settings,
  Users,
  UsersRound,
  Layers,
} from "lucide-react";

/**
 * HQ Overview navigation — group-wide surface. HQ index lives at `/` so the
 * route group `(hq)` resolves naturally without a path prefix.
 */
export const hqNav: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Countries", href: "/countries", icon: UsersRound },
  { label: "Service Mix", href: "/service-mix", icon: Layers },
  { label: "Settings", href: "/settings", icon: Settings },
];

/**
 * Country Admin navigation — single-country surface, scoped under /[country].
 */
export function countryAdminNav(countrySlug: string): NavItem[] {
  const base = `/${countrySlug}`;
  return [
    { label: "Overview", href: base, icon: LayoutDashboard },
    { label: "Pipeline", href: `${base}/pipeline`, icon: Filter },
    { label: "Agents", href: `${base}/agents`, icon: Users },
    { label: "Leads", href: `${base}/leads`, icon: BarChart3 },
    // Audit added in Phase 6 plan 06-02 — visible to country_admin +
    // hq_admin (the same allowlist as the country layout's requireRole).
    { label: "Audit", href: `${base}/audit`, icon: ScrollText },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
  ];
}

/**
 * Sales Rep navigation — agent call-queue surface, scoped under /[country]/queue.
 */
export function salesRepNav(countrySlug: string): NavItem[] {
  const base = `/${countrySlug}/queue`;
  return [
    { label: "My Queue", href: base, icon: Phone },
    { label: "Today's Stats", href: `${base}/stats`, icon: BarChart3 },
  ];
}
