"use client";

import { DashboardLayout } from "@repo/ui";
import { salesRepNav } from "@/app/_lib/nav";

interface SalesRepShellProps {
  children: React.ReactNode;
  countrySlug: string;
  countryName: string;
  title: string;
  subtitle?: string;
  currentPath?: string;
}

export function SalesRepShell({
  children,
  countrySlug,
  countryName,
  title,
  subtitle,
  currentPath,
}: SalesRepShellProps) {
  return (
    <DashboardLayout
      appName="Paratus"
      appSubtitle={`${countryName} Sales`}
      navItems={salesRepNav(countrySlug)}
      currentPath={currentPath}
      title={title}
      subtitle={subtitle}
    >
      {children}
    </DashboardLayout>
  );
}
