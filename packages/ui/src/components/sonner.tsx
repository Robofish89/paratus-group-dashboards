"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "bg-white border border-slate-200 shadow-lg text-slate-900 rounded-lg",
          description: "text-slate-500",
          actionButton: "bg-[#2B479B] text-white",
          cancelButton: "bg-slate-100 text-slate-700",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
