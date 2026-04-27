"use client";

import { DashboardLayout, type DashboardUser } from "@repo/ui";
import { salesRepNav } from "@/app/_lib/nav";

interface SalesRepShellProps {
  children: React.ReactNode;
  countrySlug: string;
  countryName: string;
  title: string;
  subtitle?: string;
  currentPath?: string;
  user?: DashboardUser;
}

export function SalesRepShell({
  children,
  countrySlug,
  countryName,
  title,
  subtitle,
  currentPath,
  user,
}: SalesRepShellProps) {
  return (
    <DashboardLayout
      appName="Paratus"
      appSubtitle={`${countryName} Sales`}
      navItems={salesRepNav(countrySlug)}
      currentPath={currentPath}
      title={title}
      subtitle={subtitle}
      user={user}
      signOutHref="/api/auth/logout"
    >
      {children}
    </DashboardLayout>
  );
}
