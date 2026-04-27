"use client";

import { DashboardLayout } from "@repo/ui";
import { hqNav } from "@/app/_lib/nav";

interface HQShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  currentPath?: string;
}

export function HQShell({
  children,
  title,
  subtitle,
  currentPath,
}: HQShellProps) {
  return (
    <DashboardLayout
      appName="Paratus"
      appSubtitle="HQ Overview"
      navItems={hqNav}
      currentPath={currentPath}
      title={title}
      subtitle={subtitle}
    >
      {children}
    </DashboardLayout>
  );
}
