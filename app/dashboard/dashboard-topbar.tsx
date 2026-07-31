"use client";

import { Bell, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/lib/session";

const pageMeta = [
  {
    path: "/dashboard/workbench",
    eyebrow: "工作空间 / 总览",
    title: "工作台",
  },
  {
    path: "/dashboard/projects",
    eyebrow: "工作空间 / 项目组合",
    title: "项目",
  },
  {
    path: "/dashboard/sprints",
    eyebrow: "工作空间 / 交付节奏",
    title: "迭代",
  },
  {
    path: "/dashboard/board",
    eyebrow: "工作空间 / 交付执行",
    title: "任务看板",
  },
  {
    path: "/dashboard/time",
    eyebrow: "工作空间 / 投入分析",
    title: "工时分析",
  },
  {
    path: "/dashboard/reports",
    eyebrow: "工作空间 / 数据洞察",
    title: "报表",
  },
  {
    path: "/dashboard/users",
    eyebrow: "组织管理 / 账号与权限",
    title: "用户与权限中心",
  },
  {
    path: "/dashboard/settings",
    eyebrow: "组织管理 / 工作空间",
    title: "设置",
  },
];

export default function DashboardTopbar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const meta =
    pageMeta.find((item) => pathname.startsWith(item.path)) ?? pageMeta[0];

  return (
    <header className="dashboard-topbar">
      <div className="topbar-title">
        <div>
          <span>{meta.eyebrow}</span>
          <h1>{meta.title}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <button className="notification-button" type="button" aria-label="通知">
          <Bell size={18} />
          <i />
        </button>
        <div className="topbar-profile">
          <span className="avatar avatar-blue">{user.name.slice(0, 1)}</span>
          <span>
            <b>{user.name}</b>
            <small>{user.department}</small>
          </span>
          <ChevronDown size={15} />
        </div>
      </div>
    </header>
  );
}
