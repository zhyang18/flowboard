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
import type { UserRole } from "@/db/schema";
import { useTranslation } from "@/lib/i18n";

type MobileNavItemKey =
  | "workbench"
  | "projects"
  | "sprints"
  | "board"
  | "time"
  | "reports"
  | "users"
  | "settings";

const items: {
  key: MobileNavItemKey;
  href: string;
  icon: typeof LayoutDashboard;
}[] = [
  { key: "workbench", href: "/dashboard/workbench", icon: LayoutDashboard },
  { key: "projects", href: "/dashboard/projects", icon: FolderKanban },
  { key: "sprints", href: "/dashboard/sprints", icon: TimerReset },
  { key: "board", href: "/dashboard/board", icon: ListChecks },
  { key: "time", href: "/dashboard/time", icon: Gauge },
  { key: "reports", href: "/dashboard/reports", icon: BarChart3 },
  { key: "users", href: "/dashboard/users", icon: Users },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
];

/**
 * 渲染按角色过滤并支持中英文国际化的移动端底部导航。
 *
 * @param props 组件属性。
 * @param props.userRole 当前登录用户的全局角色。
 * @return 移动端导航组件。
 */
export default function MobileNavigation({
  userRole,
}: {
  userRole: UserRole;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const visibleItems = items.filter(
    (item) =>
      item.href !== "/dashboard/users" ||
      userRole === "super_admin" ||
      userRole === "project_admin",
  );

  return (
    <nav className="mobile-navigation" aria-label={t("nav.workspaceSection")}>
      {visibleItems.map((item) => (
        <Link
          className={pathname.startsWith(item.href) ? "active" : ""}
          href={item.href}
          key={item.href}
        >
          <item.icon size={18} />
          <span>{t(`nav.${item.key}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
