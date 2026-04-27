import type { NavItem } from "@repo/ui";
import {
  BarChart3,
  Filter,
  LayoutDashboard,
  Phone,
  Settings,
  Users,
  UsersRound,
  Layers,
} from "lucide-react";

/**
 * HQ Overview navigation — group-wide surface.
 */
export const hqNav: NavItem[] = [
  { label: "Overview", href: "/hq", icon: LayoutDashboard },
  { label: "Countries", href: "/hq/countries", icon: UsersRound },
  { label: "Service Mix", href: "/hq/service-mix", icon: Layers },
  { label: "Settings", href: "/hq/settings", icon: Settings },
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
