import * as React from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { cn } from "../lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}

/**
 * Centered card layout for login/auth pages.
 * Displays a branded card on a light gray background with the Paratus logo at top.
 */
function AuthLayout({ children, title, description, className }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f8fafc] p-4">
      <div className={cn("w-full max-w-md", className)}>
        {/* Paratus Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="Paratus"
            width={112}
            height={112}
            priority
            className="h-24 w-auto"
          />
        </div>

        {/* Auth Card */}
        <Card className="border border-slate-200/60 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{title}</CardTitle>
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by Paratus AI Agent Platform
        </p>
      </div>
    </div>
  );
}

export { AuthLayout };
export type { AuthLayoutProps };
