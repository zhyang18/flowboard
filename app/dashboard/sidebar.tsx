"use client";

import {
  BarChart3,
  Blocks,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Settings,
  Shield,
  TimerReset,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CurrentUser } from "@/lib/session";
import { useTranslation } from "@/lib/i18n";
import LogoutButton from "./logout-button";

type NavItemKey =
  | "workbench"
  | "projects"
  | "sprints"
  | "board"
  | "time"
  | "reports"
  | "users"
  | "settings";

const navigation: { key: NavItemKey; icon: typeof LayoutDashboard; href: string }[] = [
  { key: "workbench", icon: LayoutDashboard, href: "/dashboard/workbench" },
  { key: "projects", icon: FolderKanban, href: "/dashboard/projects" },
  { key: "sprints", icon: TimerReset, href: "/dashboard/sprints" },
  { key: "board", icon: ListChecks, href: "/dashboard/board" },
  { key: "time", icon: Gauge, href: "/dashboard/time" },
  { key: "reports", icon: BarChart3, href: "/dashboard/reports" },
  { key: "users", icon: Users, href: "/dashboard/users" },
  { key: "settings", icon: Settings, href: "/dashboard/settings" },
];

/**
 * 渲染按角色过滤并支持中英文国际化的桌面侧边导航栏。
 *
 * @param props 组件属性。
 * @param props.user 当前登录用户。
 * @param props.workspaceName 当前工作空间名称。
 * @return 桌面侧边栏组件。
 */
export default function DashboardSidebar({
  user,
  workspaceName,
}: {
  user: CurrentUser;
  workspaceName: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { t, getRoleLabel } = useTranslation();

  return (
    <aside className={`dashboard-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <span className="brand-symbol" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sidebar-brand-copy">
          <b>FlowBoard</b>
          <small>{t("nav.brandSubtitle")}</small>
        </span>
      </div>

      <div className="workspace-chip">
        <span>
          <Blocks size={17} />
        </span>
        <div>
          <small>{t("nav.currentWorkspace")}</small>
          <b>{workspaceName}</b>
        </div>
      </div>

      <nav className="sidebar-navigation" aria-label={t("nav.workspaceSection")}>
        <span className="nav-section-label">{t("nav.workspaceSection")}</span>
        {navigation.slice(0, 6).map((item) => {
          const label = t(`nav.${item.key}`);
          return item.href ? (
            <Link
              className={pathname.startsWith(item.href) ? "active" : ""}
              href={item.href}
              key={item.key}
              title={label}
            >
              <item.icon size={18} />
              <span>{label}</span>
              {pathname.startsWith(item.href) && <i />}
            </Link>
          ) : (
            <button key={item.key} type="button" disabled title={label}>
              <item.icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
        <span className="nav-section-label manage-label">
          {t("nav.orgSection")}
        </span>
        {navigation
          .slice(6)
          .filter(
            (item) =>
              item.href !== "/dashboard/users" ||
              user.role === "super_admin" ||
              user.role === "project_admin",
          )
          .map((item) => {
            const label = t(`nav.${item.key}`);
            return item.href ? (
              <Link
                className={pathname.startsWith(item.href) ? "active" : ""}
                href={item.href}
                key={item.key}
                title={label}
              >
                <item.icon size={18} />
                <span>{label}</span>
                {pathname.startsWith(item.href) && <i />}
              </Link>
            ) : (
              <button key={item.key} type="button" disabled title={label}>
                <item.icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
      </nav>

      <div className="sidebar-bottom">
        <button
          className="collapse-button"
          type="button"
          aria-label={collapsed ? t("nav.expandNav") : t("nav.collapseNav")}
          aria-pressed={collapsed}
          title={collapsed ? t("nav.expandNav") : t("nav.collapseNav")}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span>{collapsed ? t("nav.expandNav") : t("nav.collapseNav")}</span>
        </button>
        <div className="sidebar-account">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <b>{user.name}</b>
            <small>
              <Shield size={11} /> {getRoleLabel(user.role)}
            </small>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
