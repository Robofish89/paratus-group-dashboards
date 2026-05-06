import type { NavItem } from "@repo/ui";
import {
  BarChart3,
  LayoutDashboard,
  Phone,
  ScrollText,
  Settings,
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
 *
 * Pipeline + Agents are sections on the Overview page (status pipeline card,
 * agent performance table) — no separate routes. Adding them as nav items
 * would 404; keep nav 1:1 with shipped routes.
 */
export function countryAdminNav(countrySlug: string): NavItem[] {
  const base = `/${countrySlug}`;
  return [
    { label: "Overview", href: base, icon: LayoutDashboard },
    { label: "Leads", href: `${base}/leads`, icon: BarChart3 },
    // Audit added in Phase 6 plan 06-02 — visible to country_admin +
    // hq_admin (the same allowlist as the country layout's requireRole).
    { label: "Audit", href: `${base}/audit`, icon: ScrollText },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
  ];
}

/**
 * Sales Rep navigation — agent call-queue surface, scoped under /[country]/queue.
 *
 * Today's Stats is rendered inline on the queue page (header strip + filters);
 * no separate route. Keep nav 1:1 with shipped routes to avoid 404s.
 */
export function salesRepNav(countrySlug: string): NavItem[] {
  const base = `/${countrySlug}/queue`;
  return [{ label: "My Queue", href: base, icon: Phone }];
}
