"use client";

import { cn } from "../lib/utils";

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  return (
    <div className={cn("border-b border-slate-200 flex gap-0", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "px-4 py-3 text-[13px] font-semibold transition-colors border-b-2 cursor-pointer",
            activeTab === tab.key
              ? "text-[#00468b] border-[#00468b]"
              : "text-slate-400 border-transparent hover:text-slate-600"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[12px]">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export { TabBar };
export type { TabBarProps, TabItem };
