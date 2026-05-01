"use client";

import { TabBar, type TabItem } from "@repo/ui";

/**
 * Two-tab bar between stats and grid (mockup lines 102–106).
 * Counts shown in parentheses match the data the parent currently holds.
 */

export type QueueTabKey = "to_call" | "completed";

interface QueueTabsProps {
  tab: QueueTabKey;
  onChange: (tab: QueueTabKey) => void;
  toCallCount: number;
  completedCount: number;
}

export function QueueTabs({
  tab,
  onChange,
  toCallCount,
  completedCount,
}: QueueTabsProps) {
  const tabs: TabItem[] = [
    { key: "to_call", label: "To Call", count: toCallCount },
    { key: "completed", label: "Completed", count: completedCount },
  ];

  return (
    <div className="overflow-x-auto">
      <TabBar
        tabs={tabs}
        activeTab={tab}
        onTabChange={(key) => onChange(key as QueueTabKey)}
      />
    </div>
  );
}
