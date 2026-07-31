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

export default function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="mobile-navigation" aria-label="移动端主导航">
      {items.map((item) => (
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
