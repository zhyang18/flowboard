"use client";

import {
  BarChart3,
  Blocks,
  ChevronLeft,
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
import LogoutButton from "./logout-button";

const navigation = [
  { label: "工作台", icon: LayoutDashboard, href: "/dashboard/workbench" },
  { label: "项目", icon: FolderKanban, href: "/dashboard/projects" },
  { label: "迭代", icon: TimerReset, href: "/dashboard/sprints" },
  { label: "任务看板", icon: ListChecks, href: "/dashboard/board" },
  { label: "工时分析", icon: Gauge, href: "/dashboard/time" },
  { label: "报表", icon: BarChart3, href: "/dashboard/reports" },
  { label: "用户管理", icon: Users, href: "/dashboard/users" },
  { label: "设置", icon: Settings, href: "/dashboard/settings" },
];

export default function DashboardSidebar({
  user,
  workspaceName,
}: {
  user: CurrentUser;
  workspaceName: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
          <small>研发效能平台</small>
        </span>
      </div>

      <div className="workspace-chip">
        <span><Blocks size={17} /></span>
        <div>
          <small>当前工作空间</small>
          <b>{workspaceName}</b>
        </div>
      </div>

      <nav className="sidebar-navigation" aria-label="主导航">
        <span className="nav-section-label">工作空间</span>
        {navigation.slice(0, 6).map((item) => (
          item.href ? (
            <Link
              className={pathname.startsWith(item.href) ? "active" : ""}
              href={item.href}
              key={item.label}
              title={item.label}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {pathname.startsWith(item.href) && <i />}
            </Link>
          ) : (
            <button key={item.label} type="button" disabled title="后续模块">
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        ))}
        <span className="nav-section-label manage-label">组织管理</span>
        {navigation.slice(6).map((item) => (
          item.href ? (
            <Link
              className={pathname.startsWith(item.href) ? "active" : ""}
              href={item.href}
              key={item.label}
              title={item.label}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {pathname.startsWith(item.href) && <i />}
            </Link>
          ) : (
            <button key={item.label} type="button" disabled title="后续模块">
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          className="collapse-button"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronLeft size={17} />
          <span>收起导航</span>
        </button>
        <div className="sidebar-account">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <b>{user.name}</b>
            <small>
              <Shield size={11} /> {user.role === "super_admin" ? "超级管理员" : "项目管理员"}
            </small>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
