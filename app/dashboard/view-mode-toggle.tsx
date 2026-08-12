"use client";

import { LayoutGrid, List } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

export type ViewMode = "card" | "list";

const VIEW_MODE_EVENT = "flowboard:view-mode-change";
const viewModeMemory = new Map<string, ViewMode>();

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  cardLabel: string;
  listLabel: string;
};

/**
 * 从浏览器存储读取指定模块的布局模式。
 *
 * @param storageKey 布局模式存储键。
 * @return 已保存的布局模式，读取失败时返回卡片模式。
 */
function readViewMode(storageKey: string): ViewMode {
  if (typeof window === "undefined") return viewModeMemory.get(storageKey) ?? "card";
  try {
    const storedViewMode = window.localStorage.getItem(storageKey);
    if (storedViewMode === "card" || storedViewMode === "list") {
      viewModeMemory.set(storageKey, storedViewMode);
      return storedViewMode;
    }
    return viewModeMemory.get(storageKey) ?? "card";
  } catch {
    return viewModeMemory.get(storageKey) ?? "card";
  }
}

/**
 * 订阅同窗口和跨窗口的布局模式变更。
 *
 * @param storageKey 布局模式存储键。
 * @param onStoreChange 外部存储变更回调。
 * @return 取消订阅函数。
 */
function subscribeViewMode(storageKey: string, onStoreChange: () => void) {
  /**
   * 处理其他浏览器窗口写入的布局模式。
   *
   * @param event 浏览器存储事件。
   */
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onStoreChange();
  };
  /**
   * 处理当前窗口写入的布局模式。
   *
   * @param event 当前窗口布局变更事件。
   */
  const handleViewModeChange = (event: Event) => {
    if ((event as CustomEvent<string>).detail === storageKey) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(VIEW_MODE_EVENT, handleViewModeChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(VIEW_MODE_EVENT, handleViewModeChange);
  };
}

/**
 * 持久化并同步指定模块的卡片或列表布局选择。
 *
 * @param storageKey 布局模式存储键。
 * @return 当前布局模式和布局更新函数。
 */
export function usePersistentViewMode(storageKey: string) {
  /**
   * 订阅当前模块的布局模式变化。
   *
   * @param onStoreChange 外部存储变更回调。
   * @return 取消订阅函数。
   */
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeViewMode(storageKey, onStoreChange),
    [storageKey],
  );
  /**
   * 获取当前模块的布局模式快照。
   *
   * @return 当前布局模式。
   */
  const getSnapshot = useCallback(() => readViewMode(storageKey), [storageKey]);
  const viewMode = useSyncExternalStore<ViewMode>(
    subscribe,
    getSnapshot,
    () => "card",
  );
  /**
   * 保存并广播当前模块的布局模式。
   *
   * @param nextViewMode 新布局模式。
   */
  const setViewMode = useCallback(
    (nextViewMode: ViewMode) => {
      viewModeMemory.set(storageKey, nextViewMode);
      try {
        window.localStorage.setItem(storageKey, nextViewMode);
      } catch {
        // 浏览器禁用本地存储时仍保留当前会话内的布局选择。
      }
      window.dispatchEvent(
        new CustomEvent<string>(VIEW_MODE_EVENT, { detail: storageKey }),
      );
    },
    [storageKey],
  );
  return [viewMode, setViewMode] as const;
}

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
