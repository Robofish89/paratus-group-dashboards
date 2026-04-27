import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Toaster } from "@repo/ui";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Paratus Group Dashboards",
  description:
    "Lead pipeline command center for Paratus Group — 12 active African countries.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={dmSans.variable}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
