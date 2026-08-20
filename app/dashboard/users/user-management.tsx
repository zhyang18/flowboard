"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CircleUserRound,
  Clock3,
  Edit3,
  KeyRound,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundCog,
  Users,
  UserX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import type { UserRole, UserStatus } from "@/db/schema";
import {
  defaultSystemRoles,
  permissionRows,
  type RoleDefinition,
} from "@/lib/roles";
import { useTranslation } from "@/lib/i18n";
import { useDashboardDialog } from "../dashboard-dialog-provider";
import PaginationControls from "../pagination-controls";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: string;
  team: string;
  role: UserRole;
  status: UserStatus;
  projectCount: number;
  capacity: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UsersResponse = {
  data: ManagedUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  stats: {
    total: number;
    active: number;
    invited: number;
    admins: number;
  };
  departments: string[];
  error?: string;
};

type UserForm = {
  name: string;
  email: string;
  phone: string;
  department: string;
  team: string;
  role: UserRole;
  status: UserStatus;
  password: string;
};

type RoleForm = {
  name: string;
  description: string;
  tone: string;
  permissions: boolean[];
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  department: "研发中心",
  team: "平台研发组",
  role: "member",
  status: "invited",
  password: "",
};

const emptyRoleForm: RoleForm = {
  name: "",
  description: "",
  tone: "blue",
  permissions: [false, false, false, false, false, false],
};

const toneOptions = [
  { value: "violet", labelZh: "紫罗兰", labelEn: "Violet", color: "#7456ca" },
  { value: "blue", labelZh: "科技蓝", labelEn: "Tech Blue", color: "#2f7df6" },
  { value: "green", labelZh: "翡翠绿", labelEn: "Emerald Green", color: "#21a279" },
  { value: "orange", labelZh: "琥珀橙", labelEn: "Amber Orange", color: "#e37318" },
  { value: "gray", labelZh: "经典灰", labelEn: "Classic Gray", color: "#64748b" },
  { value: "rose", labelZh: "玫瑰红", labelEn: "Rose Red", color: "#e11d48" },
];

/**
 * 提取用户名首字作为头像文本。
 *
 * @param name 用户姓名。
 * @return 单字符头像文本。
 */
function userInitials(name: string): string {
  return name.trim().slice(0, 1) || "U";
}

/**
 * 格式化用户最后活跃时间。
 *
 * @param value ISO 时间或空值。
 * @param locale 当前语言环境。
 * @return 相对时间或日期时间文本。
 */
function formatLastSeen(value: string | null, locale: string): string {
  if (!value) return locale === "zh" ? "从未登录" : "Never logged in";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return locale === "zh" ? "刚刚在线" : "Just now";
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟前` : `${minutes}m ago`;
  if (minutes < 24 * 60) {
    return locale === "zh"
      ? `${Math.floor(minutes / 60)} 小时前`
      : `${Math.floor(minutes / 60)}h ago`;
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * 渲染支持中英文国际化的用户分页、角色矩阵与账号维护表单。
 *
 * @param props 组件属性。
 * @param props.currentUserId 当前登录用户 ID。
 * @param props.currentUserRole 当前登录用户角色。
 * @return 用户管理组件。
 */
export default function UserManagement({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const { t, locale, getRoleLabel, getUserStatusLabel, getPermissionLabel } =
    useTranslation();
  const { confirm } = useDashboardDialog();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    invited: 0,
    admins: 0,
  });
  const [departments, setDepartments] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<RoleDefinition[]>(defaultSystemRoles);
  const [roleModalMode, setRoleModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRoleForm);
  const [savingRole, setSavingRole] = useState(false);

  /**
   * 按当前筛选、排序和分页加载用户及派生指标。
   *
   * @return 加载完成后的 Promise。
   */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (query.trim()) params.set("query", query.trim());
    if (department) params.set("department", department);
    if (status) params.set("status", status);

    try {
      const response = await fetch(`/api/users?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as UsersResponse;
      if (!response.ok) throw new Error(result.error ?? t("common.error"));

      const lastPage = Math.max(
        1,
        Math.ceil(result.pagination.total / pageSize),
      );
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setUsers(result.data);
      setStats(result.stats);
      setDepartments(result.departments);
      setTotal(result.pagination.total);
      setSelectedUserId((current) => {
        if (current && result.data.some((user) => user.id === current)) {
          return current;
        }
        return result.data[0]?.id ?? null;
      });
      setSelectedIds((current) =>
        current.filter((id) => result.data.some((user) => user.id === id)),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("common.error"),
      );
    } finally {
      setLoading(false);
    }
  }, [department, page, pageSize, query, sortBy, sortOrder, status, t]);

  /**
   * 从服务端加载全部角色定义和关联成员统计。
   *
   * @return 加载完成后的 Promise。
   */
  const loadRoles = useCallback(async () => {
    try {
      const response = await fetch("/api/roles", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: RoleDefinition[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      if (result.data) {
        setRoles(result.data);
      }
    } catch {
      // 忽略非关键错误
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(loadUsers, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, query]);

  useEffect(() => {
    if (tab !== "roles") return;
    const timer = window.setTimeout(() => void loadRoles(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRoles, tab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users],
  );

  /**
   * 触发用户列表表头排序。
   *
   * @param field 目标排序字段名称。
   */
  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  /**
   * 渲染表头排序指示图标。
   *
   * @param field 列对应排序字段。
   * @return 排序图标元素。
   */
  function renderSortIcon(field: string) {
    if (sortBy !== field) {
      return <ArrowUpDown size={13} className="sort-icon inactive" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={13} className="sort-icon active" />
    ) : (
      <ArrowDown size={13} className="sort-icon active" />
    );
  }

  /**
   * 修改用户列表每页数量并返回第一页。
   *
   * @param nextPageSize 新的每页数量。
   */
  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  /**
   * 打开新建用户表单。
   */
  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalMode("create");
  }

  /**
   * 使用现有用户资料打开编辑表单。
   *
   * @param user 待编辑用户。
   */
  function openEdit(user: ManagedUser) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      department: user.department,
      team: user.team,
      role: user.role,
      status: user.status,
      password: "",
    });
    setModalMode("edit");
  }

  /**
   * 创建或更新组织用户。
   *
   * @param event 用户表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        modalMode === "edit" && editingId
          ? `/api/users/${editingId}`
          : "/api/users",
        {
          method: modalMode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = (await response.json()) as {
        data?: ManagedUser;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));

      setModalMode(null);
      setNotice(t("users.saveSuccess"));
      await loadUsers();
      if (result.data) setSelectedUserId(result.data.id);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("common.error"),
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * 停用或恢复允许维护的用户账号。
   *
   * @param user 目标用户。
   * @return 状态更新完成后的 Promise。
   */
  async function toggleUserStatus(user: ManagedUser) {
    const nextStatus: UserStatus =
      user.status === "disabled" ? "active" : "disabled";

    if (user.id === currentUserId) {
      setNotice(t("users.cannotDisableSelf"));
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(
        nextStatus === "disabled"
          ? t("users.disabledSuccess")
          : t("users.enabledSuccess"),
      );
      await loadUsers();
    } catch (statusError) {
      setNotice(
        statusError instanceof Error
          ? statusError.message
          : t("common.error"),
      );
    }
  }

  /**
   * 删除没有业务历史的停用用户。
   *
   * @param user 目标用户。
   * @return 删除完成后的 Promise。
   */
  async function deleteUser(user: ManagedUser) {
    const confirmed = await confirm({
      title: t("users.deleteConfirmTitle"),
      message: t("users.deleteConfirmMsg", { name: user.name }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("users.deleteSuccess"));
      await loadUsers();
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error
          ? deleteError.message
          : t("common.error"),
      );
    }
  }

  /**
   * 切换当前页用户的批量选择状态。
   *
   * @param id 用户 ID。
   */
  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  /**
   * 打开新建角色模态弹窗。
   */
  function openCreateRole() {
    setEditingRoleId(null);
    setRoleForm({
      name: "",
      description: "",
      tone: "blue",
      permissions: [false, false, false, false, false, false],
    });
    setRoleModalMode("create");
  }

  /**
   * 打开编辑角色模态弹窗。
   *
   * @param role 待编辑的角色对象。
   */
  function openEditRole(role: RoleDefinition) {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description,
      tone: role.tone,
      permissions: [...role.permissions],
    });
    setRoleModalMode("edit");
  }

  /**
   * 提交保存角色信息（新增或编辑）。
   *
   * @param event 角色表单提交事件。
   * @return 保存流程完成后的 Promise。
   */
  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRole(true);
    setError("");

    try {
      const isEdit = roleModalMode === "edit" && editingRoleId;
      const response = await fetch(
        isEdit ? `/api/roles/${editingRoleId}` : "/api/roles",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(roleForm),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));

      setRoleModalMode(null);
      setNotice(isEdit ? t("common.success") : t("common.success"));
      await loadRoles();
    } catch (saveRoleErr) {
      setError(
        saveRoleErr instanceof Error ? saveRoleErr.message : t("common.error"),
      );
    } finally {
      setSavingRole(false);
    }
  }

  /**
   * 删除自定义角色。
   *
   * @param role 待删除角色。
   * @return 删除完成后的 Promise。
   */
  async function deleteRole(role: RoleDefinition) {
    if (role.isSystem) {
      setNotice(t("common.error"));
      return;
    }
    const confirmed = await confirm({
      title: t("common.delete"),
      message: `${t("common.delete")} "${role.name}"?`,
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));

      setNotice(t("common.success"));
      await loadRoles();
    } catch (delRoleErr) {
      setNotice(
        delRoleErr instanceof Error ? delRoleErr.message : t("common.error"),
      );
    }
  }

  /**
   * 切换角色表单中特定权限的勾选状态。
   *
   * @param index 权限在 permissionRows 中的索引。
   */
  function toggleRolePermission(index: number) {
    setRoleForm((prev) => {
      const nextPerms = [...prev.permissions];
      nextPerms[index] = !nextPerms[index];
      return { ...prev, permissions: nextPerms };
    });
  }

  return (
    <div className="user-management-page">
      <section className="user-page-heading">
        <div>
          <span className="eyebrow">{t("users.eyebrow")}</span>
          <h2>{t("users.heading")}</h2>
          <p>{t("users.description")}</p>
        </div>
        {tab === "users" ? (
          <button
            className="primary-action"
            type="button"
            onClick={openCreate}
          >
            <Plus size={17} />
            <span>{t("users.newUser")}</span>
          </button>
        ) : (
          currentUserRole === "super_admin" && (
            <button
              className="primary-action"
              type="button"
              onClick={openCreateRole}
            >
              <Plus size={17} />
              <span>{t("users.roles.newRole")}</span>
            </button>
          )
        )}
      </section>

      <section className="user-stat-grid" aria-label={t("users.heading")}>
        <article>
          <span className="stat-icon blue">
            <Users size={20} />
          </span>
          <div>
            <small>{t("users.stats.total")}</small>
            <b>{stats.total}</b>
            <em>{t("users.itemUnit")}</em>
          </div>
        </article>
        <article>
          <span className="stat-icon green">
            <UserCheck size={20} />
          </span>
          <div>
            <small>{t("userStatuses.active")}</small>
            <b>{stats.active}</b>
            <em>{t("users.activeDesc")}</em>
          </div>
        </article>
        <article>
          <span className="stat-icon orange">
            <Clock3 size={20} />
          </span>
          <div>
            <small>{t("userStatuses.invited")}</small>
            <b>{stats.invited}</b>
            <em>{t("users.invitedDesc")}</em>
          </div>
        </article>
        <article>
          <span className="stat-icon violet">
            <ShieldCheck size={20} />
          </span>
          <div>
            <small>{t("roles.project_admin")}</small>
            <b>{stats.admins}</b>
            <em>{t("users.adminDesc")}</em>
          </div>
        </article>
      </section>

      <div className="management-tabs" role="tablist" aria-label="Tabs">
        <button
          className={tab === "users" ? "active" : ""}
          role="tab"
          aria-selected={tab === "users"}
          type="button"
          onClick={() => setTab("users")}
        >
          <Users size={16} /> {t("users.tabs.userList")} <span>{stats.total}</span>
        </button>
        <button
          className={tab === "roles" ? "active" : ""}
          role="tab"
          aria-selected={tab === "roles"}
          type="button"
          onClick={() => setTab("roles")}
        >
          <KeyRound size={16} /> {t("users.tabs.rolesPermissions")}{" "}
          <span>{roles.length}</span>
        </button>
      </div>

      {tab === "users" ? (
        <>
          <section className="user-toolbar" aria-label={t("users.tabs.userList")}>
            <label className="search-control">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={t("users.searchPlaceholder")}
              />
              {query && (
                <button
                  type="button"
                  aria-label={t("common.reset")}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label>
              <select
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("users.allDepartments")}</option>
                {departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("projects.allStatuses")}</option>
                <option value="active">{t("userStatuses.active")}</option>
                <option value="disabled">{t("userStatuses.disabled")}</option>
                <option value="invited">{t("userStatuses.invited")}</option>
              </select>
            </label>
            <button
              className="refresh-button"
              type="button"
              aria-label={t("reports.refreshAria")}
              onClick={loadUsers}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
            <span className="result-count">
              {t("pagination.totalSummary", {
                total,
                label: t("users.itemUnit"),
              })}
            </span>
          </section>

          {selectedIds.length > 0 && (
            <div className="batch-bar">
              <span>
                {t("users.selectedCount", { count: selectedIds.length })}
              </span>
              <button type="button" onClick={() => setSelectedIds([])}>
                {t("common.cancel")}
              </button>
            </div>
          )}

          {error && !modalMode && !roleModalMode && (
            <div className="page-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button type="button" onClick={loadUsers}>
                {t("common.reset")}
              </button>
            </div>
          )}

          <section className="users-content-grid">
            <div className="users-table-card">
              <div className="table-scroll">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th className="checkbox-column">
                        <input
                          type="checkbox"
                          aria-label="Select all users"
                          checked={
                            users.length > 0 &&
                            selectedIds.length === users.length
                          }
                          onChange={(event) =>
                            setSelectedIds(
                              event.target.checked
                                ? users.map((user) => user.id)
                                : [],
                            )
                          }
                        />
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("name")}
                      >
                        <div className="th-content">
                          <span>{t("common.member")}</span>
                          {renderSortIcon("name")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("department")}
                      >
                        <div className="th-content">
                          <span>{t("users.departmentLabel")}</span>
                          {renderSortIcon("department")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("role")}
                      >
                        <div className="th-content">
                          <span>{t("users.roleLabel")}</span>
                          {renderSortIcon("role")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("status")}
                      >
                        <div className="th-content">
                          <span>{t("common.status")}</span>
                          {renderSortIcon("status")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("lastSeenAt")}
                      >
                        <div className="th-content">
                          <span>{t("users.lastSeenLabel")}</span>
                          {renderSortIcon("lastSeenAt")}
                        </div>
                      </th>
                      <th className="actions-column">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && users.length === 0
                      ? Array.from({ length: 6 }).map((_, index) => (
                          <tr className="skeleton-row" key={index}>
                            <td colSpan={7}>
                              <span />
                            </td>
                          </tr>
                        ))
                      : users.map((user) => (
                          <tr
                            key={user.id}
                            className={
                              selectedUser?.id === user.id ? "selected" : ""
                            }
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <td
                              className="checkbox-column"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Select ${user.name}`}
                                checked={selectedIds.includes(user.id)}
                                onChange={() => toggleSelected(user.id)}
                              />
                            </td>
                            <td>
                              <div className="user-cell">
                                <span className="avatar avatar-soft">
                                  {userInitials(user.name)}
                                </span>
                                <div>
                                  <b>{user.name}</b>
                                  <small>{user.email}</small>
                                  <em>{user.id.slice(0, 8).toUpperCase()}</em>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="team-cell">
                                <b>{user.department}</b>
                                <small>{user.team}</small>
                              </div>
                            </td>
                            <td>
                              <span className={`role-chip role-${user.role}`}>
                                {getRoleLabel(user.role)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`status-chip status-${user.status}`}
                              >
                                <i /> {getUserStatusLabel(user.status)}
                              </span>
                            </td>
                            <td>
                              <span className="last-seen">
                                {formatLastSeen(user.lastSeenAt, locale)}
                              </span>
                            </td>
                            <td
                              className="row-actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {(currentUserRole === "super_admin" ||
                                !["super_admin", "project_admin"].includes(
                                  user.role,
                                )) && (
                                <>
                                  <button
                                    type="button"
                                    title={t("common.edit")}
                                    aria-label={`${t("common.edit")} ${user.name}`}
                                    onClick={() => openEdit(user)}
                                  >
                                    <Edit3 size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    title={
                                      user.status === "disabled"
                                        ? t("users.enableAccount")
                                        : t("users.disableAccount")
                                    }
                                    aria-label={
                                      user.status === "disabled"
                                        ? `${t("users.enableAccount")} ${user.name}`
                                        : `${t("users.disableAccount")} ${user.name}`
                                    }
                                    onClick={() => toggleUserStatus(user)}
                                  >
                                    {user.status === "disabled" ? (
                                      <UserCheck size={15} />
                                    ) : (
                                      <UserX size={15} />
                                    )}
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                aria-label={t("common.actions")}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
                {!loading && users.length === 0 && (
                  <div className="empty-users">
                    <CircleUserRound size={36} />
                    <b>{t("projects.noMatches")}</b>
                    <p>{t("projects.createFirstProject")}</p>
                  </div>
                )}
              </div>
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={total}
                itemLabel={t("users.itemUnit")}
                onPageChange={setPage}
                onPageSizeChange={changePageSize}
              />
            </div>

            {selectedUser && (
              <aside className="user-detail-card">
                <header>
                  <span className="avatar detail-avatar">
                    {userInitials(selectedUser.name)}
                  </span>
                  <div>
                    <h3>{selectedUser.name}</h3>
                    <p>{selectedUser.email}</p>
                  </div>
                  <span
                    className={`status-chip status-${selectedUser.status}`}
                  >
                    <i /> {getUserStatusLabel(selectedUser.status)}
                  </span>
                </header>
                {(currentUserRole === "super_admin" ||
                  !["super_admin", "project_admin"].includes(
                    selectedUser.role,
                  )) && (
                  <div className="detail-actions">
                    <button
                      className="detail-primary"
                      type="button"
                      onClick={() => openEdit(selectedUser)}
                    >
                      <Edit3 size={15} /> {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleUserStatus(selectedUser)}
                      disabled={selectedUser.id === currentUserId}
                    >
                      <UserX size={15} />
                      {selectedUser.status === "disabled"
                        ? t("users.enableAccount")
                        : t("users.disableAccount")}
                    </button>
                  </div>
                )}
                <dl className="user-facts">
                  <div>
                    <dt>{t("users.departmentLabel")}</dt>
                    <dd>{selectedUser.department}</dd>
                  </div>
                  <div>
                    <dt>{t("users.teamLabel")}</dt>
                    <dd>{selectedUser.team}</dd>
                  </div>
                  <div>
                    <dt>{t("users.roleLabel")}</dt>
                    <dd>{getRoleLabel(selectedUser.role)}</dd>
                  </div>
                  <div>
                    <dt>{t("users.phoneLabel")}</dt>
                    <dd>{selectedUser.phone || t("common.none")}</dd>
                  </div>
                  <div>
                    <dt>{t("users.createdAtLabel")}</dt>
                    <dd>
                      {new Date(selectedUser.createdAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </dd>
                  </div>
                </dl>
                <section className="capacity-panel">
                  <header>
                    <b>{t("reports.trendEyebrow")}</b>
                    <span>{selectedUser.capacity}%</span>
                  </header>
                  <div>
                    <i
                      style={{
                        width: `${Math.min(100, selectedUser.capacity)}%`,
                      }}
                    />
                  </div>
                  <p>
                    {t("workbench.totalProjectsSuffix", {
                      count: selectedUser.projectCount,
                    })}
                  </p>
                </section>
                <section className="recent-activity">
                  <h4>{t("users.accountOverview")}</h4>
                  <div>
                    <span>
                      <Mail size={14} />
                    </span>
                    <p>
                      <b>{t("users.emailVerified")}</b>
                      <small>{selectedUser.email}</small>
                    </p>
                  </div>
                  <div>
                    <span>
                      <Clock3 size={14} />
                    </span>
                    <p>
                      <b>{t("users.lastSeenLabel")}</b>
                      <small>
                        {formatLastSeen(selectedUser.lastSeenAt, locale)}
                      </small>
                    </p>
                  </div>
                </section>
                {currentUserRole === "super_admin" &&
                  selectedUser.id !== currentUserId && (
                    <button
                      className="delete-user-button"
                      type="button"
                      onClick={() => deleteUser(selectedUser)}
                    >
                      <Trash2 size={14} /> {t("common.delete")}
                    </button>
                  )}
              </aside>
            )}
          </section>
        </>
      ) : (
        <section className="roles-view">
          <div className="role-card-grid">
            {roles.map((role) => (
              <article
                className={`role-card tone-${role.tone}`}
                key={role.id}
              >
                <header>
                  <span>
                    <UserRoundCog size={18} />
                  </span>
                  <b>
                    {role.userCount ?? 0} {t("users.itemUnit")}
                  </b>
                </header>
                <div className="role-card-body">
                  <div className="role-title-row">
                    <h3>{role.isSystem ? getRoleLabel(role.id) : role.name}</h3>
                    {role.isSystem && (
                      <span className="system-role-tag">
                        {t("users.roles.systemPreset")}
                      </span>
                    )}
                  </div>
                  <p>{role.description || t("common.none")}</p>
                </div>
                <div className="role-card-footer">
                  {currentUserRole === "super_admin" ? (
                    <div className="role-card-actions">
                      <button
                        type="button"
                        className="role-action-button"
                        onClick={() => openEditRole(role)}
                        title={t("users.roles.editPermissions")}
                      >
                        <Edit3 size={13} />
                        <span>{t("users.roles.editPermissions")}</span>
                      </button>
                      {!role.isSystem && (
                        <button
                          type="button"
                          className="role-action-button danger"
                          onClick={() => deleteRole(role)}
                          title={t("common.delete")}
                        >
                          <Trash2 size={13} />
                          <span>{t("common.delete")}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="role-view-only-hint">
                      <ShieldCheck size={13} /> {t("roles.viewer")}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <article className="permission-matrix">
            <header>
              <div>
                <span className="eyebrow">{t("users.roles.matrixEyebrow")}</span>
                <h3>{t("users.roles.matrixHeading")}</h3>
              </div>
              <span>{t("users.roles.rbacModel")}</span>
            </header>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>{t("users.roles.featurePermission")}</th>
                    {roles.map((role) => (
                      <th key={role.id}>
                        {role.isSystem ? getRoleLabel(role.id) : role.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.map((permission, rowIndex) => (
                    <tr key={permission}>
                      <td>{getPermissionLabel(permission)}</td>
                      {roles.map((role) => {
                        const hasPermission = Boolean(
                          role.permissions[rowIndex],
                        );
                        return (
                          <td key={role.id}>
                            <span
                              className={
                                hasPermission
                                  ? "permission-yes"
                                  : "permission-no"
                              }
                            >
                              {hasPermission ? (
                                <Check size={14} />
                              ) : (
                                <X size={13} />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {/* 用户新增/编辑模态框 */}
      {modalMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setModalMode(null)}
        >
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">
                  {modalMode === "create"
                    ? t("users.modalCreateTitle")
                    : t("users.modalEditTitle")}
                </span>
                <h2 id="user-modal-title">
                  {modalMode === "create"
                    ? t("users.newUser")
                    : t("users.modalEditTitle")}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setModalMode(null)}
              >
                <X size={19} />
              </button>
            </header>
            <form onSubmit={submitUser}>
              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <div className="modal-form-grid">
                <label>
                  <span>{t("users.nameLabel")}</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder={t("users.nameLabel")}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>{t("users.emailLabel")}</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    placeholder="name@company.com"
                    required
                  />
                </label>
                <label>
                  <span>{t("users.phoneLabel")}</span>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                    placeholder={t("users.phonePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("users.passwordLabel")}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    placeholder={
                      modalMode === "edit"
                        ? t("users.passwordEditPlaceholder")
                        : t("users.passwordCreatePlaceholder")
                    }
                    required={
                      modalMode === "create" && form.status === "active"
                    }
                  />
                </label>
                <label>
                  <span>{t("users.departmentLabel")}</span>
                  <input
                    value={form.department}
                    onChange={(event) =>
                      setForm({ ...form, department: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>{t("users.teamLabel")}</span>
                  <input
                    value={form.team}
                    onChange={(event) =>
                      setForm({ ...form, team: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>{t("users.roleLabel")}</span>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        role: event.target.value as UserRole,
                      })
                    }
                  >
                    {currentUserRole === "super_admin" && (
                      <option value="super_admin">
                        {t("roles.super_admin")}
                      </option>
                    )}
                    {currentUserRole === "super_admin" && (
                      <option value="project_admin">
                        {t("roles.project_admin")}
                      </option>
                    )}
                    <option value="member">{t("roles.member")}</option>
                    <option value="tester">{t("roles.tester")}</option>
                    <option value="viewer">{t("roles.viewer")}</option>
                    {roles
                      .filter(
                        (r) =>
                          ![
                            "super_admin",
                            "project_admin",
                            "member",
                            "tester",
                            "viewer",
                          ].includes(r.id),
                      )
                      .map((customRole) => (
                        <option key={customRole.id} value={customRole.id}>
                          {customRole.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("common.status")}</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as UserStatus,
                      })
                    }
                  >
                    <option value="active">{t("userStatuses.active")}</option>
                    <option value="invited">
                      {t("userStatuses.invited")}
                    </option>
                    <option value="disabled">
                      {t("userStatuses.disabled")}
                    </option>
                  </select>
                </label>
              </div>
              <p className="form-hint">
                {t("users.passwordCreatePlaceholder")}
              </p>
              <footer>
                <button type="button" onClick={() => setModalMode(null)}>
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? t("common.saving")
                    : modalMode === "create"
                      ? t("common.create")
                      : t("common.save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* 角色新增/编辑模态框 */}
      {roleModalMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setRoleModalMode(null)}
        >
          <section
            className="user-modal role-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">
                  {roleModalMode === "create"
                    ? t("users.roles.newRole")
                    : t("users.roles.editPermissions")}
                </span>
                <h2 id="role-modal-title">
                  {roleModalMode === "create"
                    ? t("users.roles.newRole")
                    : t("users.roles.editPermissions")}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setRoleModalMode(null)}
              >
                <X size={19} />
              </button>
            </header>
            <form onSubmit={submitRole}>
              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <div className="modal-form-grid">
                <label>
                  <span>{t("users.roles.roleNameLabel")}</span>
                  <input
                    value={roleForm.name}
                    onChange={(event) =>
                      setRoleForm({ ...roleForm, name: event.target.value })
                    }
                    placeholder={t("users.roles.roleNamePlaceholder")}
                    required
                    maxLength={30}
                    autoFocus
                  />
                </label>
                <label>
                  <span>{t("users.roles.toneLabel")}</span>
                  <select
                    value={roleForm.tone}
                    onChange={(event) =>
                      setRoleForm({ ...roleForm, tone: event.target.value })
                    }
                  >
                    {toneOptions.map((tone) => (
                      <option key={tone.value} value={tone.value}>
                        {locale === "zh" ? tone.labelZh : tone.labelEn}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full-width">
                  <span>{t("users.roles.descriptionLabel")}</span>
                  <input
                    value={roleForm.description}
                    onChange={(event) =>
                      setRoleForm({
                        ...roleForm,
                        description: event.target.value,
                      })
                    }
                    placeholder={t("users.roles.descriptionPlaceholder")}
                    maxLength={200}
                  />
                </label>
              </div>

              <div className="role-permissions-config">
                <h4>{t("users.roles.checkPermissionsTitle")}</h4>
                <div className="permissions-checkbox-grid">
                  {permissionRows.map((perm, idx) => (
                    <label key={perm} className="permission-check-item">
                      <input
                        type="checkbox"
                        checked={Boolean(roleForm.permissions[idx])}
                        onChange={() => toggleRolePermission(idx)}
                      />
                      <span>{getPermissionLabel(perm)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <footer>
                <button
                  type="button"
                  onClick={() => setRoleModalMode(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={savingRole}
                >
                  {savingRole
                    ? t("common.saving")
                    : roleModalMode === "create"
                      ? t("common.create")
                      : t("common.save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <Check size={15} /> {notice}
        </div>
      )}
    </div>
  );
}
