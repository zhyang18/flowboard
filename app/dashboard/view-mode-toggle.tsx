"use client";

import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "card" | "list";

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  cardLabel: string;
  listLabel: string;
};

/**
 * 渲染卡片与列表布局的无障碍切换按钮。
 *
 * @param value 当前布局模式。
 * @param onChange 布局模式变更回调。
 * @param cardLabel 卡片模式的可访问名称。
 * @param listLabel 列表模式的可访问名称。
 * @return 布局切换组件。
 */
export default function ViewModeToggle({
  value,
  onChange,
  cardLabel,
  listLabel,
}: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle" role="group" aria-label="布局切换">
      <button
        className={value === "card" ? "active" : ""}
        type="button"
        aria-pressed={value === "card"}
        aria-label={cardLabel}
        title={cardLabel}
        onClick={() => onChange("card")}
      >
        <LayoutGrid size={14} />
        <span>卡片</span>
      </button>
      <button
        className={value === "list" ? "active" : ""}
        type="button"
        aria-pressed={value === "list"}
        aria-label={listLabel}
        title={listLabel}
        onClick={() => onChange("list")}
      >
        <List size={14} />
        <span>列表</span>
      </button>
    </div>
  );
}
