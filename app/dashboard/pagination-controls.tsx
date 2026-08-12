"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

const pageSizeOptions = [10, 30, 50, 100] as const;
const maxCustomPageSize = 500;

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

/**
 * 将自定义每页数量限制在安全且可用的范围内。
 *
 * @param value 用户输入的每页数量。
 * @return 1 到 500 之间的整数。
 */
function normalizePageSize(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(maxCustomPageSize, Math.max(1, Math.floor(value)));
}

/**
 * 计算分页栏中需要展示的页码，最多显示连续五页。
 *
 * @param page 当前页码。
 * @param totalPages 总页数。
 * @return 要展示的页码数组。
 */
function getVisiblePages(page: number, totalPages: number): number[] {
  const visibleCount = Math.min(5, totalPages);
  const start = Math.min(
    Math.max(1, page - Math.floor(visibleCount / 2)),
    Math.max(1, totalPages - visibleCount + 1),
  );
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

/**
 * 为已在客户端加载的数据提供分页状态和当前页切片。
 *
 * @param items 已完成筛选的完整列表。
 * @param initialPageSize 初始每页数量。
 * @return 当前页数据及分页控制方法。
 */
export function useClientPagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSize] = useState(normalizePageSize(initialPageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [currentPage, items, pageSize]);

  /**
   * 切换到指定有效页码。
   *
   * @param nextPage 目标页码。
   * @return 无返回值。
   */
  const setPage = useCallback(
    (nextPage: number) => {
      setPageState(Math.min(totalPages, Math.max(1, Math.floor(nextPage))));
    },
    [totalPages],
  );

  /**
   * 修改每页数量并回到第一页。
   *
   * @param nextPageSize 新的每页数量。
   * @return 无返回值。
   */
  const changePageSize = useCallback((nextPageSize: number) => {
    setPageSize(normalizePageSize(nextPageSize));
    setPageState(1);
  }, []);

  /**
   * 将分页重置为第一页。
   *
   * @return 无返回值。
   */
  const resetPage = useCallback(() => {
    setPageState(1);
  }, []);

  return {
    page: currentPage,
    pageSize,
    totalPages,
    pageItems,
    setPage,
    changePageSize,
    resetPage,
  };
}

/**
 * 渲染统一的页码、每页数量和自定义数量控制区。
 *
 * @param page 当前页码。
 * @param pageSize 当前每页数量。
 * @param total 列表总条目数。
 * @param itemLabel 条目单位名称。
 * @param onPageChange 页码变化回调。
 * @param onPageSizeChange 每页数量变化回调。
 * @return 分页控制组件。
 */
export default function PaginationControls({
  page,
  pageSize,
  total,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const [customMode, setCustomMode] = useState(
    !pageSizeOptions.includes(pageSize as (typeof pageSizeOptions)[number]),
  );
  const [customValue, setCustomValue] = useState(String(pageSize));
  const visiblePages = getVisiblePages(currentPage, totalPages);

  /**
   * 处理预设或自定义每页数量选择。
   *
   * @param event 下拉选择事件。
   * @return 无返回值。
   */
  function handlePageSizeSelect(event: ChangeEvent<HTMLSelectElement>) {
    if (event.target.value === "custom") {
      setCustomMode(true);
      setCustomValue(String(pageSize));
      return;
    }
    setCustomMode(false);
    onPageSizeChange(Number(event.target.value));
  }

  /**
   * 应用用户输入的自定义每页数量。
   *
   * @param event 自定义数量表单提交事件。
   * @return 无返回值。
   */
  function applyCustomPageSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPageSize = normalizePageSize(Number(customValue));
    setCustomValue(String(nextPageSize));
    onPageSizeChange(nextPageSize);
  }

  return (
    <nav className="list-pagination" aria-label={`${itemLabel}列表分页`}>
      <div className="pagination-summary">
        <span>共 {total} {itemLabel}</span>
        <label>
          <span>每页显示</span>
          <select
            aria-label="选择每页显示数量"
            value={customMode ? "custom" : String(pageSize)}
            onChange={handlePageSizeSelect}
          >
            {pageSizeOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
            <option value="custom">自定义</option>
          </select>
        </label>
        {customMode && (
          <form className="pagination-custom-size" onSubmit={applyCustomPageSize}>
            <input
              type="number"
              min="1"
              max={maxCustomPageSize}
              value={customValue}
              aria-label="自定义每页显示数量"
              onChange={(event) => setCustomValue(event.target.value)}
            />
            <button type="submit">应用</button>
          </form>
        )}
      </div>
      <div className="pagination-pages">
        <span>第 {currentPage} / {totalPages} 页</span>
        <button
          type="button"
          aria-label="上一页"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        {visiblePages.map((pageNumber) => (
          <button
            className={pageNumber === currentPage ? "active" : ""}
            type="button"
            aria-label={`第 ${pageNumber} 页`}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            onClick={() => onPageChange(pageNumber)}
            key={pageNumber}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          aria-label="下一页"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}
