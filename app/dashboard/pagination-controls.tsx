"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, type ChangeEvent } from "react";
import { useState } from "react";

const pageSizeOptions = [10, 30, 50, 100] as const;

type PaginationControlsProps = {
  /** 当前页码 */
  page: number;
  /** 每页条目数 */
  pageSize: number;
  /** 总条目数 */
  total: number;
  /** 条目单位名称 */
  itemLabel: string;
  /** 页码变化回调 */
  onPageChange: (page: number) => void;
  /** 每页数量变化回调 */
  onPageSizeChange: (pageSize: number) => void;
};

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
  return Array.from({ length: visibleCount }, (_, i) => start + i);
}

/**
 * 将自定义每页数量限制在安全且可用的范围内。
 *
 * @param value 用户输入的每页数量。
 * @return 1 到 500 之间的整数。
 */
function normalizePageSize(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(500, Math.max(1, Math.floor(value)));
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
   */
  const changePageSize = useCallback((nextPageSize: number) => {
    setPageSize(normalizePageSize(nextPageSize));
    setPageState(1);
  }, []);

  /**
   * 将分页重置为第一页。
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
 * 紧凑型分页控制组件，包含每页条数下拉选择与极简翻页按钮。
 *
 * @param page 当前页码。
 * @param pageSize 当前每页数量。
 * @param total 列表总条目数。
 * @param itemLabel 条目单位名称。
 * @param onPageChange 页码变化回调。
 * @param onPageSizeChange 每页数量变化回调。
 * @return 紧凑型分页组件。
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
  const visiblePages = getVisiblePages(currentPage, totalPages);

  function handlePageSizeChange(e: ChangeEvent<HTMLSelectElement>) {
    onPageSizeChange(Number(e.target.value));
  }

  return (
    <nav className="list-pagination" aria-label={`${itemLabel}列表翻页`}>
      {/* 左侧：总数与每页条数选择 */}
      <div className="pagination-info">
        <span className="pagination-total">共 {total} {itemLabel}</span>
        <select
          className="pagination-size-select"
          value={pageSizeOptions.includes(pageSize as any) ? pageSize : 10}
          onChange={handlePageSizeChange}
          title="选择每页显示条数"
          aria-label="选择每页显示条数"
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option} 条/页
            </option>
          ))}
        </select>
      </div>

      {/* 右侧：翻页按钮区 */}
      <div className="pagination-pages">
        <button
          type="button"
          aria-label="上一页"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft size={13} />
        </button>

        {visiblePages.map((pageNumber) => (
          <button
            key={pageNumber}
            className={pageNumber === currentPage ? "active" : ""}
            type="button"
            aria-label={`第 ${pageNumber} 页`}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            onClick={() => onPageChange(pageNumber)}
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
          <ChevronRight size={13} />
        </button>
      </div>
    </nav>
  );
}
