"use client";

import {
  BarChart3,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Settings,
  TimerReset,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "工作台", href: "/dashboard/workbench", icon: LayoutDashboard },
  { label: "项目", href: "/dashboard/projects", icon: FolderKanban },
  { label: "迭代", href: "/dashboard/sprints", icon: TimerReset },
  { label: "看板", href: "/dashboard/board", icon: ListChecks },
  { label: "工时", href: "/dashboard/time", icon: Gauge },
  { label: "报表", href: "/dashboard/reports", icon: BarChart3 },
  { label: "用户", href: "/dashboard/users", icon: Users },
  { label: "设置", href: "/dashboard/settings", icon: Settings },
];

/**
 * 渲染按角色过滤的移动端底部导航。
 *
 * @param canManageUsers 当前登录用户是否可以管理用户。
 * @return 移动端导航组件。
 */
export default function MobileNavigation({ canManageUsers }: { canManageUsers: boolean }) {
  const pathname = usePathname();
  const visibleItems = items.filter(
    (item) =>
      item.href !== "/dashboard/users" ||
      canManageUsers,
  );

  return (
    <nav className="mobile-navigation" aria-label="移动端主导航">
      {visibleItems.map((item) => (
        <Link
          className={pathname.startsWith(item.href) ? "active" : ""}
          href={item.href}
          key={item.href}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
