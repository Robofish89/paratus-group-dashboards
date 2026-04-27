import { cn } from "../lib/utils";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

function SectionCard({ title, subtitle, children, className }: SectionCardProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-[#e2e8f0]/40 p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <div className="mb-[18px]">
        <h3 className="text-[13px] font-semibold text-[#0f172a]">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export { SectionCard };
export type { SectionCardProps };
