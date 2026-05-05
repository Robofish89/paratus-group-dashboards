"use client";

import { DashboardLayout, ONBOARDING_BASE_URL, type DashboardUser } from "@repo/ui";
import { countryAdminNav } from "@/app/_lib/nav";

interface CountryAdminShellProps {
  children: React.ReactNode;
  countrySlug: string;
  countryName: string;
  title: string;
  subtitle?: string;
  currentPath?: string;
  user?: DashboardUser;
}

export function CountryAdminShell({
  children,
  countrySlug,
  countryName,
  title,
  subtitle,
  currentPath,
  user,
}: CountryAdminShellProps) {
  return (
    <DashboardLayout
      appName="Paratus"
      appSubtitle={`${countryName} Admin`}
      navItems={countryAdminNav(countrySlug)}
      currentPath={currentPath}
      title={title}
      subtitle={subtitle}
      user={user}
      signOutHref="/api/auth/logout"
      helpHref={`${ONBOARDING_BASE_URL}/docs/onboarding/country-admin.md`}
    >
      {children}
    </DashboardLayout>
  );
}
