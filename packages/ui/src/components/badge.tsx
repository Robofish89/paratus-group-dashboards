import * as React from "react";
import { cn } from "../lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-[#2B479B] text-white",
  secondary: "border-transparent bg-slate-100 text-slate-700",
  destructive: "border-transparent bg-red-500 text-white",
  outline: "border-slate-300 text-slate-700",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
export type { BadgeProps };
