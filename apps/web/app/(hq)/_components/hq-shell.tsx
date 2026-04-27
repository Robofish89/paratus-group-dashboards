"use client";

import { DashboardLayout, type DashboardUser } from "@repo/ui";
import { hqNav } from "@/app/_lib/nav";

interface HQShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  currentPath?: string;
  user?: DashboardUser;
}

export function HQShell({
  children,
  title,
  subtitle,
  currentPath,
  user,
}: HQShellProps) {
  return (
    <DashboardLayout
      appName="Paratus"
      appSubtitle="HQ Overview"
      navItems={hqNav}
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
