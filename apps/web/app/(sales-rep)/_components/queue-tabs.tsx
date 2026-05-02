"use client";

import { TabBar, type TabItem } from "@repo/ui";

/**
 * Four-tab bar between stats and grid (plan 03-04 vocabulary):
 *   To Call / Follow-ups / Converted / Lost
 *
 * Counts shown in parentheses match the data the parent currently holds.
 * Converted + Lost lists are range-aware (driven by ?range URL state); the
 * counts therefore reflect the current range.
 */

export type QueueTabKey = "to_call" | "follow_ups" | "converted" | "lost";

interface QueueTabsProps {
  tab: QueueTabKey;
  onChange: (tab: QueueTabKey) => void;
  counts: Record<QueueTabKey, number>;
}

export function QueueTabs({ tab, onChange, counts }: QueueTabsProps) {
  const tabs: TabItem[] = [
    { key: "to_call", label: "To Call", count: counts.to_call },
    { key: "follow_ups", label: "Follow-ups", count: counts.follow_ups },
    { key: "converted", label: "Converted", count: counts.converted },
    { key: "lost", label: "Lost", count: counts.lost },
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
