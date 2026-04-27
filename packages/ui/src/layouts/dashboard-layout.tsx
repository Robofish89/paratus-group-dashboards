"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, LogOut } from "lucide-react";
import { cn } from "../lib/utils";

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
}

export interface DashboardUser {
  name: string;
  email: string;
  role?: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  navItems: NavItem[];
  appName: string;
  appSubtitle?: string;
  title?: string;
  subtitle?: string;
  user?: DashboardUser;
  className?: string;
  onSignOut?: () => void;
  /**
   * Override the active-route detection. Useful for server components that
   * cannot use `usePathname`. When omitted, falls back to the client pathname.
   */
  currentPath?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function DashboardLayout({
  children,
  navItems,
  appName,
  appSubtitle,
  title,
  subtitle,
  user,
  className,
  onSignOut,
  currentPath,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const activePath = currentPath ?? pathname;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 bottom-0 w-64 bg-[#0F172A] flex flex-col">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-6">
          <Image
            src="/logo.png"
            alt={appName}
            width={36}
            height={36}
            className="rounded-lg brightness-[1.8]"
          />
          <div>
            <div className="text-[15px] font-bold tracking-tight text-white leading-none">
              {appName}
            </div>
            {appSubtitle && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b] mt-0.5">
                {appSubtitle}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pt-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? activePath === "/"
                : activePath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 mb-1",
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-[#94a3b8] hover:text-[#cbd5e1] hover:bg-white/[0.04]"
                )}
              >
                {item.icon && (
                  <item.icon
                    className={cn(
                      "w-[18px] h-[18px]",
                      isActive ? "opacity-100" : "opacity-60"
                    )}
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        {user && (
          <div className="border-t border-white/[0.06] px-4 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[#334155] flex items-center justify-center text-[#94a3b8] text-xs font-semibold">
                {getInitials(user.name)}
              </div>
              <div className="overflow-hidden">
                <div className="text-[13px] font-medium text-[#e2e8f0] truncate">
                  {user.name}
                </div>
                <div className="text-[11px] text-[#64748b] truncate">
                  {user.role ?? user.email}
                </div>
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 text-[12px] text-[#64748b] hover:text-[#94a3b8] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 ml-64 bg-[#f8fafc] min-h-screen", className)}>
        {(title || subtitle) && (
          <div className="px-8 pt-8 pb-2">
            {title && (
              <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            )}
            {subtitle && (
              <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
            )}
          </div>
        )}
        <div className={cn(title || subtitle ? "px-8 py-4" : "p-8", "max-w-[1280px]")}>
          {children}
        </div>
      </main>
    </div>
  );
}

export { DashboardLayout };
export type { DashboardLayoutProps };
