"use client";

import {
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Mail,
  RotateCcw,
  Settings,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DashboardNotification,
  NotificationKind,
} from "@/lib/notifications";
import type { CurrentUser } from "@/lib/session";
import { roleLabels } from "@/lib/users";
import LogoutButton from "./logout-button";

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

type OpenMenu = "notifications" | "profile" | null;

/**
 * 根据提醒类型渲染对应的状态图标。
 *
 * @param kind 消息提醒类型。
 * @return 对应的提醒图标。
 */
function NotificationIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "rejected") return <RotateCcw size={17} />;
  if (kind === "overdue") return <CircleAlert size={17} />;
  if (kind === "review") return <CheckCircle2 size={17} />;
  if (kind === "overrun") return <Clock3 size={17} />;
  return <CalendarClock size={17} />;
}

/**
 * 渲染带消息提醒和用户详情菜单的仪表盘顶栏。
 *
 * @param user 当前登录用户。
 * @return 仪表盘顶栏组件。
 */
export default function DashboardTopbar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const actionsRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState("");
  const meta =
    pageMeta.find((item) => pathname.startsWith(item.path)) ?? pageMeta[0];
  const canManageUsers = user.role === "super_admin" || user.permissions.manageUsers;

  /**
   * 从服务端加载当前用户可处理的交付风险消息。
   *
   * @return 加载流程完成后的 Promise。
   */
  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: DashboardNotification[];
        count?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "消息提醒加载失败。");
      setNotifications(result.data ?? []);
      setNotificationCount(result.count ?? 0);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "消息提醒加载失败。");
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadNotifications]);

  useEffect(() => {
    /**
     * 点击顶栏操作区之外时关闭当前弹层。
     *
     * @param event 当前鼠标按下事件。
     */
    function closeOnOutsideClick(event: MouseEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }

    /**
     * 按下 Escape 时关闭当前弹层。
     *
     * @param event 当前键盘事件。
     */
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  /**
   * 打开或关闭消息提醒弹层，并在打开时刷新数据。
   */
  function toggleNotifications() {
    if (openMenu === "notifications") {
      setOpenMenu(null);
      return;
    }
    setOpenMenu("notifications");
    void loadNotifications();
  }

  /**
   * 打开或关闭当前用户详情弹层。
   */
  function toggleProfile() {
    setOpenMenu((value) => value === "profile" ? null : "profile");
  }

  /**
   * 将持久化任务通知标记为已读并同步本地计数。
   *
   * @param id 通知 ID。
   * @return 标记请求完成后的 Promise。
   */
  async function markNotificationRead(id: string): Promise<void> {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      setNotifications((current) => current.filter((item) => item.id !== id));
      setNotificationCount((current) => Math.max(0, current - 1));
    } catch {
      // 跳转不应被已读同步失败阻断，下一次打开通知时仍会显示该消息。
    }
  }

  return (
    <header className="dashboard-topbar">
      <div className="topbar-title">
        <div>
          <span>{meta.eyebrow}</span>
          <h1>{meta.title}</h1>
        </div>
      </div>
      <div className="topbar-actions" ref={actionsRef}>
        <button
          className={`notification-button ${notificationCount > 0 ? "has-alerts" : ""}`}
          type="button"
          aria-label={`消息提醒，${notificationCount} 条待处理`}
          aria-controls="notification-popover"
          aria-expanded={openMenu === "notifications"}
          onClick={toggleNotifications}
        >
          <Bell size={18} />
          {notificationCount > 0 && <i />}
        </button>
        <button
          className="topbar-profile"
          type="button"
          aria-label="查看用户详情"
          aria-controls="profile-popover"
          aria-expanded={openMenu === "profile"}
          onClick={toggleProfile}
        >
          <span className="avatar avatar-blue">{user.name.slice(0, 1)}</span>
          <span>
            <b>{user.name}</b>
            <small>{user.department || "未设置部门"}</small>
          </span>
          <ChevronDown className="profile-chevron" size={15} />
        </button>

        {openMenu === "notifications" && (
          <section
            className="topbar-popover notification-popover"
            id="notification-popover"
            aria-label="消息提醒"
          >
            <header className="popover-heading">
              <div>
                <b>消息提醒</b>
                <span>聚合当前可见任务的交付风险</span>
              </div>
              <em>{notificationCount} 条待处理</em>
            </header>
            <div className="notification-list">
              {notificationsLoading ? (
                <div className="popover-state">正在刷新消息…</div>
              ) : notificationError ? (
                <div className="popover-state error">
                  <CircleAlert size={20} />
                  <span>{notificationError}</span>
                  <button type="button" onClick={() => void loadNotifications()}>重新加载</button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="popover-state empty">
                  <CheckCircle2 size={23} />
                  <b>暂无待处理提醒</b>
                  <span>当前任务风险均在可控范围内</span>
                </div>
              ) : notifications.map((item) => (
                <Link
                  className={`notification-item ${item.kind}`}
                  href={item.href}
                  key={item.id}
                  onClick={() => {
                    setOpenMenu(null);
                    if (item.persistent) void markNotificationRead(item.id);
                  }}
                >
                  <span className="notification-kind-icon">
                    <NotificationIcon kind={item.kind} />
                  </span>
                  <span className="notification-copy">
                    <span><b>{item.label}</b><time>{item.timeLabel}</time></span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                </Link>
              ))}
            </div>
            <footer className="popover-footer">
              <Link href="/dashboard/board" onClick={() => setOpenMenu(null)}>
                前往任务看板
              </Link>
              <span>最多展示 8 条</span>
            </footer>
          </section>
        )}

        {openMenu === "profile" && (
          <section
            className="topbar-popover profile-popover"
            id="profile-popover"
            aria-label="用户详情"
          >
            <header className="profile-popover-heading">
              <span className="avatar avatar-blue profile-popover-avatar">
                {user.name.slice(0, 1)}
              </span>
              <div>
                <b>{user.name}</b>
                <span>{user.roleName || roleLabels[user.role]}</span>
              </div>
              <em><ShieldCheck size={12} /> 账号正常</em>
            </header>
            <div className="profile-detail-list">
              <span><Mail size={15} /><i>登录邮箱</i><b>{user.email}</b></span>
              <span><Building2 size={15} /><i>所属部门</i><b>{user.department || "未设置"}</b></span>
              <span><UsersRound size={15} /><i>所属团队</i><b>{user.team || "未设置"}</b></span>
            </div>
            <nav className="profile-menu" aria-label="账号操作">
              <Link href="/dashboard/settings" onClick={() => setOpenMenu(null)}>
                <Settings size={16} /><span>工作空间设置</span>
              </Link>
              {canManageUsers && (
                <Link href="/dashboard/users" onClick={() => setOpenMenu(null)}>
                  <UserRoundCog size={16} /><span>用户与权限</span>
                </Link>
              )}
              <LogoutButton variant="menu" />
            </nav>
          </section>
        )}
      </div>
    </header>
  );
}
