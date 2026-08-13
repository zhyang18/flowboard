"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
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
import type { RolePermissions, UserRole, UserStatus } from "@/db/schema";
import {
  rolePermissionDefinitions,
  systemRoleDefinitions,
  type RoleTone,
} from "@/lib/roles";
import { roleLabels, statusLabels, type UserSortKey } from "@/lib/users";
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
  roleDefinitionId: string;
  roleName: string;
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
  roleDefinitionId: string;
  status: UserStatus;
  password: string;
};

type ManagedRole = {
  id: string;
  code: string;
  name: string;
  description: string;
  baseRole: UserRole;
  permissions: RolePermissions;
  tone: RoleTone;
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

type RolesResponse = {
  data?: ManagedRole[];
  canManage?: boolean;
  error?: string;
};

type RoleForm = {
  name: string;
  description: string;
  baseRole: UserRole;
  permissions: RolePermissions;
  tone: RoleTone;
};

type SortDirection = "asc" | "desc";

/**
 * 渲染可切换方向的用户列表表头。
 *
 * @param label 表头显示文本。
 * @param sortKey 当前表头对应的排序字段。
 * @param activeSortKey 当前生效的排序字段。
 * @param direction 当前排序方向。
 * @param onSort 触发表头排序的回调。
 * @return 可访问的用户排序表头。
 */
function UserSortableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: UserSortKey;
  activeSortKey: UserSortKey;
  direction: SortDirection;
  onSort: (sortKey: UserSortKey) => void;
}) {
  const active = sortKey === activeSortKey;
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={`table-sort-button${active ? " active" : ""}`}
        type="button"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />
        ) : (
          <ArrowUpDown size={13} />
        )}
      </button>
    </th>
  );
}

const emptyForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  department: "研发中心",
  team: "平台研发组",
  roleDefinitionId: "",
  status: "invited",
  password: "",
};

const emptyRoleForm: RoleForm = {
  name: "",
  description: "",
  baseRole: "member",
  permissions: systemRoleDefinitions.find((role) => role.baseRole === "member")!
    .permissions,
  tone: "blue",
};

/**
 * 提取用户名首字作为头像文本。
 *
 * @param name 用户姓名。
 * @return 单字符头像文本。
 */
function userInitials(name: string) {
  return name.trim().slice(0, 1) || "用";
}

/**
 * 格式化用户最后活跃时间。
 *
 * @param value ISO 时间或空值。
 * @return 相对时间或日期时间文本。
 */
function formatLastSeen(value: string | null) {
  if (!value) return "从未登录";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚在线";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * 渲染用户分页、角色矩阵和账号维护表单。
 *
 * @param currentUserId 当前登录用户 ID。
 * @param currentUserRole 当前登录用户角色。
 * @return 用户管理组件。
 */
export default function UserManagement({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const { confirm } = useDashboardDialog();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [canManageRoles, setCanManageRoles] = useState(false);
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
  const [sortBy, setSortBy] = useState<UserSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
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
  const [roleModalMode, setRoleModalMode] = useState<"create" | "edit" | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRoleForm);
  const [savingRole, setSavingRole] = useState(false);

  /**
   * 加载可分配角色及其实际关联用户数。
   *
   * @return 加载完成后的 Promise。
   */
  const loadRoles = useCallback(async () => {
    try {
      const response = await fetch("/api/roles", { cache: "no-store" });
      const result = (await response.json()) as RolesResponse;
      if (!response.ok) throw new Error(result.error ?? "角色列表加载失败。");
      setRoles(result.data ?? []);
      setCanManageRoles(Boolean(result.canManage));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "角色列表加载失败。");
    }
  }, []);

  /**
   * 按当前筛选和分页加载用户及派生指标。
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
      sortDirection,
    });
    if (query.trim()) params.set("query", query.trim());
    if (department) params.set("department", department);
    if (status) params.set("status", status);

    try {
      const response = await fetch(`/api/users?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as UsersResponse;
      if (!response.ok) throw new Error(result.error ?? "用户列表加载失败。");

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
        loadError instanceof Error ? loadError.message : "用户列表加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [department, page, pageSize, query, sortBy, sortDirection, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadUsers, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoles(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRoles]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users],
  );
  const editingRole = roles.find((role) => role.id === editingRoleId) ?? null;
  /**
   * 修改用户列表每页数量并返回第一页。
   *
   * @param nextPageSize 新的每页数量。
   * @return 无返回值。
   */
  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  /**
   * 切换用户列表的排序字段或当前字段方向。
   *
   * @param nextSortBy 用户点击的排序字段。
   * @return 无返回值。
   */
  function changeSort(nextSortBy: UserSortKey) {
    if (nextSortBy === sortBy) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(nextSortBy);
      setSortDirection("asc");
    }
    setPage(1);
  }

  /**
   * 打开新建用户表单。
   *
   * @return 无返回值。
   */
  function openCreate() {
    const defaultRole =
      roles.find((role) => role.baseRole === "member" && role.isSystem) ?? roles[0];
    setEditingId(null);
    setForm({ ...emptyForm, roleDefinitionId: defaultRole?.id ?? "" });
    setModalMode("create");
  }

  /**
   * 使用现有用户资料打开编辑表单。
   *
   * @param user 待编辑用户。
   * @return 无返回值。
   */
  function openEdit(user: ManagedUser) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      department: user.department,
      team: user.team,
      roleDefinitionId: user.roleDefinitionId,
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
      if (!response.ok) throw new Error(result.error ?? "保存失败。");

      setModalMode(null);
      setNotice(modalMode === "edit" ? "用户资料已更新" : "新用户已创建");
      await Promise.all([loadUsers(), loadRoles()]);
      if (result.data) setSelectedUserId(result.data.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败。");
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
      setNotice("不能停用当前登录账号");
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "状态更新失败。");
      setNotice(nextStatus === "disabled" ? "账号已停用" : "账号已恢复");
      await loadUsers();
    } catch (statusError) {
      setNotice(
        statusError instanceof Error ? statusError.message : "状态更新失败。",
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
      title: "删除用户",
      message: `确定删除“${user.name}”吗？此操作会移除该账号及其登录会话，且无法撤销。`,
      confirmLabel: "删除用户",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "删除失败。");
      setNotice("用户已删除");
      await Promise.all([loadUsers(), loadRoles()]);
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error ? deleteError.message : "删除失败。",
      );
    }
  }

  /**
   * 切换当前页用户的批量选择状态。
   *
   * @param id 用户 ID。
   * @return 无返回值。
   */
  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  /**
   * 打开新增角色表单。
   *
   * @return 无返回值。
   */
  function openCreateRole() {
    setEditingRoleId(null);
    setRoleForm({ ...emptyRoleForm, permissions: { ...emptyRoleForm.permissions } });
    setRoleModalMode("create");
  }

  /**
   * 使用现有角色配置打开编辑表单。
   *
   * @param role 待编辑角色。
   * @return 无返回值。
   */
  function openEditRole(role: ManagedRole) {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description,
      baseRole: role.baseRole,
      permissions: { ...role.permissions },
      tone: role.tone,
    });
    setRoleModalMode("edit");
  }

  /**
   * 创建或更新角色权限配置。
   *
   * @param event 角色表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRole(true);
    setError("");
    try {
      const response = await fetch(
        roleModalMode === "edit" && editingRoleId
          ? `/api/roles/${editingRoleId}`
          : "/api/roles",
        {
          method: roleModalMode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(roleForm),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "角色保存失败。");
      setRoleModalMode(null);
      setNotice(roleModalMode === "edit" ? "角色权限已更新" : "新角色已创建");
      await loadRoles();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "角色保存失败。");
    } finally {
      setSavingRole(false);
    }
  }

  /**
   * 删除没有关联用户的自定义角色。
   *
   * @param role 待删除角色。
   * @return 删除完成后的 Promise。
   */
  async function deleteRole(role: ManagedRole) {
    const confirmed = await confirm({
      title: "删除角色",
      message: `确定删除角色“${role.name}”吗？删除后无法恢复。`,
      confirmLabel: "删除角色",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "角色删除失败。");
      setNotice("角色已删除");
      await loadRoles();
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : "角色删除失败。");
    }
  }

  return (
    <div className="user-management-page">
      <section className="user-page-heading">
        <div>
          <span className="eyebrow">组织成员</span>
          <h2>用户管理</h2>
          <p>集中维护成员资料、团队归属、账号状态与访问权限。</p>
        </div>
        <button className="primary-action" type="button" onClick={openCreate}>
          <Plus size={17} />
          <span>新建用户</span>
        </button>
      </section>

      <section className="user-stat-grid" aria-label="用户统计">
        <article>
          <span className="stat-icon blue"><Users size={20} /></span>
          <div><small>全部用户</small><b>{stats.total}</b><em>组织成员总数</em></div>
        </article>
        <article>
          <span className="stat-icon green"><UserCheck size={20} /></span>
          <div><small>正常账号</small><b>{stats.active}</b><em>可正常访问系统</em></div>
        </article>
        <article>
          <span className="stat-icon orange"><Clock3 size={20} /></span>
          <div><small>待激活</small><b>{stats.invited}</b><em>等待接受邀请</em></div>
        </article>
        <article>
          <span className="stat-icon violet"><ShieldCheck size={20} /></span>
          <div><small>管理员</small><b>{stats.admins}</b><em>拥有管理权限</em></div>
        </article>
      </section>

      <div className="management-tabs" role="tablist" aria-label="用户管理视图">
        <button
          className={tab === "users" ? "active" : ""}
          role="tab"
          aria-selected={tab === "users"}
          type="button"
          onClick={() => setTab("users")}
        >
          <Users size={16} /> 用户列表 <span>{stats.total}</span>
        </button>
        <button
          className={tab === "roles" ? "active" : ""}
          role="tab"
          aria-selected={tab === "roles"}
          type="button"
          onClick={() => setTab("roles")}
        >
          <KeyRound size={16} /> 角色与权限 <span>{roles.length}</span>
        </button>
      </div>

      {tab === "users" ? (
        <>
          <section className="user-toolbar" aria-label="筛选用户">
            <label className="search-control">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">搜索用户</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索姓名、邮箱或团队"
              />
              {query && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label>
              <span className="sr-only">按部门筛选</span>
              <select
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部部门</option>
                {departments.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">按账号状态筛选</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部状态</option>
                <option value="active">正常</option>
                <option value="disabled">已停用</option>
                <option value="invited">待激活</option>
              </select>
            </label>
            <button
              className="refresh-button"
              type="button"
              aria-label="刷新用户列表"
              onClick={loadUsers}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
            <span className="result-count">共 {total} 位成员</span>
          </section>

          {selectedIds.length > 0 && (
            <div className="batch-bar">
              <span>已选择 <b>{selectedIds.length}</b> 位成员</span>
              <button type="button" onClick={() => setSelectedIds([])}>取消选择</button>
            </div>
          )}

          {error && !modalMode && (
            <div className="page-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button type="button" onClick={loadUsers}>重新加载</button>
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
                          aria-label="选择当前页全部用户"
                          checked={users.length > 0 && selectedIds.length === users.length}
                          onChange={(event) =>
                            setSelectedIds(
                              event.target.checked ? users.map((user) => user.id) : [],
                            )
                          }
                        />
                      </th>
                      <UserSortableHeader label="用户" sortKey="name" activeSortKey={sortBy} direction={sortDirection} onSort={changeSort} />
                      <UserSortableHeader label="部门 / 团队" sortKey="department" activeSortKey={sortBy} direction={sortDirection} onSort={changeSort} />
                      <UserSortableHeader label="角色" sortKey="role" activeSortKey={sortBy} direction={sortDirection} onSort={changeSort} />
                      <UserSortableHeader label="账号状态" sortKey="status" activeSortKey={sortBy} direction={sortDirection} onSort={changeSort} />
                      <UserSortableHeader label="最后活跃" sortKey="lastSeenAt" activeSortKey={sortBy} direction={sortDirection} onSort={changeSort} />
                      <th className="actions-column">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && users.length === 0
                      ? Array.from({ length: 6 }).map((_, index) => (
                          <tr className="skeleton-row" key={index}>
                            <td colSpan={7}><span /></td>
                          </tr>
                        ))
                      : users.map((user) => (
                          <tr
                            key={user.id}
                            className={selectedUser?.id === user.id ? "selected" : ""}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <td
                              className="checkbox-column"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                aria-label={`选择 ${user.name}`}
                                checked={selectedIds.includes(user.id)}
                                onChange={() => toggleSelected(user.id)}
                              />
                            </td>
                            <td>
                              <div className="user-cell">
                                <span className="avatar avatar-soft">{userInitials(user.name)}</span>
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
                                {user.roleName || roleLabels[user.role]}
                              </span>
                            </td>
                            <td>
                              <span className={`status-chip status-${user.status}`}>
                                <i /> {statusLabels[user.status]}
                              </span>
                            </td>
                            <td><span className="last-seen">{formatLastSeen(user.lastSeenAt)}</span></td>
                            <td
                              className="row-actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {(currentUserRole === "super_admin" || !["super_admin", "project_admin"].includes(user.role)) && (
                                <>
                                  <button
                                    type="button"
                                    title="编辑用户"
                                    aria-label={`编辑 ${user.name}`}
                                    onClick={() => openEdit(user)}
                                  >
                                    <Edit3 size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    title={user.status === "disabled" ? "恢复账号" : "停用账号"}
                                    aria-label={user.status === "disabled" ? `恢复 ${user.name}` : `停用 ${user.name}`}
                                    onClick={() => toggleUserStatus(user)}
                                  >
                                    {user.status === "disabled" ? <UserCheck size={15} /> : <UserX size={15} />}
                                  </button>
                                </>
                              )}
                              <button type="button" aria-label="更多操作">
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
                    <b>没有找到符合条件的成员</b>
                    <p>尝试调整搜索条件，或新增一位组织成员。</p>
                  </div>
                )}
              </div>
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={total}
                itemLabel="位成员"
                onPageChange={setPage}
                onPageSizeChange={changePageSize}
              />
            </div>

            {selectedUser && (
              <aside className="user-detail-card">
                <header>
                  <span className="avatar detail-avatar">{userInitials(selectedUser.name)}</span>
                  <div>
                    <h3>{selectedUser.name}</h3>
                    <p>{selectedUser.email}</p>
                  </div>
                  <span className={`status-chip status-${selectedUser.status}`}>
                    <i /> {statusLabels[selectedUser.status]}
                  </span>
                </header>
                {(currentUserRole === "super_admin" || !["super_admin", "project_admin"].includes(selectedUser.role)) && <div className="detail-actions">
                  <button className="detail-primary" type="button" onClick={() => openEdit(selectedUser)}>
                    <Edit3 size={15} /> 编辑资料
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleUserStatus(selectedUser)}
                    disabled={selectedUser.id === currentUserId}
                  >
                    <UserX size={15} />
                    {selectedUser.status === "disabled" ? "恢复" : "停用"}
                  </button>
                </div>}
                <dl className="user-facts">
                  <div><dt>所属部门</dt><dd>{selectedUser.department}</dd></div>
                  <div><dt>所属团队</dt><dd>{selectedUser.team}</dd></div>
                  <div><dt>用户角色</dt><dd>{selectedUser.roleName || roleLabels[selectedUser.role]}</dd></div>
                  <div><dt>手机号码</dt><dd>{selectedUser.phone || "未填写"}</dd></div>
                  <div><dt>加入时间</dt><dd>{new Date(selectedUser.createdAt).toLocaleDateString("zh-CN")}</dd></div>
                </dl>
                <section className="capacity-panel">
                  <header><b>近 7 日工时利用率</b><span>{selectedUser.capacity}%</span></header>
                  <div><i style={{ width: `${Math.min(100, selectedUser.capacity)}%` }} /></div>
                  <p>参与 {selectedUser.projectCount} 个项目 · 最近 7 天已登记工时利用率</p>
                </section>
                <section className="recent-activity">
                  <h4>账号概况</h4>
                  <div>
                    <span><Mail size={14} /></span>
                    <p><b>邮箱身份已登记</b><small>{selectedUser.email}</small></p>
                  </div>
                  <div>
                    <span><Clock3 size={14} /></span>
                    <p><b>最后活跃时间</b><small>{formatLastSeen(selectedUser.lastSeenAt)}</small></p>
                  </div>
                </section>
                {currentUserRole === "super_admin" && selectedUser.id !== currentUserId && (
                  <button
                    className="delete-user-button"
                    type="button"
                    onClick={() => deleteUser(selectedUser)}
                    disabled={selectedUser.status !== "disabled"}
                    title={
                      selectedUser.status === "disabled"
                        ? "删除此账号"
                        : "请先停用账号"
                    }
                  >
                    <Trash2 size={14} /> 删除此账号
                  </button>
                )}
              </aside>
            )}
          </section>
        </>
      ) : (
        <section className="roles-view">
          <header className="roles-view-heading">
            <div>
              <span className="eyebrow">组织访问控制</span>
              <h3>角色与权限</h3>
              <p>角色可直接分配给用户；权限基线控制项目可见性和任务工作流。</p>
            </div>
            {canManageRoles && (
              <button className="primary-action" type="button" onClick={openCreateRole}>
                <Plus size={16} /> 新增角色
              </button>
            )}
          </header>
          <div className="role-card-grid">
            {roles.map((role) => (
              <article className={`role-card tone-${role.tone}`} key={role.id}>
                <header>
                  <span><UserRoundCog size={18} /></span>
                  <b>{role.userCount} 人</b>
                </header>
                <h3>{role.name}</h3>
                <p>{role.description}</p>
                <small className="role-base-label">权限基线：{roleLabels[role.baseRole]}</small>
                <div className="role-card-actions">
                  {canManageRoles ? (
                    <>
                      <button type="button" onClick={() => openEditRole(role)}>
                        <Edit3 size={14} /> 编辑
                      </button>
                      {!role.isSystem && (
                        <button
                          className="danger"
                          type="button"
                          disabled={role.userCount > 0}
                          title={role.userCount > 0 ? "请先调整关联用户的角色" : "删除角色"}
                          onClick={() => void deleteRole(role)}
                        >
                          <Trash2 size={14} /> 删除
                        </button>
                      )}
                    </>
                  ) : (
                    <button type="button" onClick={() => openEditRole(role)}>
                      查看权限详情 <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <article className="permission-matrix">
            <header>
              <div>
                <span className="eyebrow">访问控制</span>
                <h3>角色权限矩阵</h3>
              </div>
              <span>RBAC 权限模型</span>
            </header>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>功能权限</th>
                    {roles.map((role) => (
                      <th key={role.id}>{role.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rolePermissionDefinitions.map((permission) => (
                    <tr key={permission.key}>
                      <td>{permission.label}</td>
                      {roles.map((role) => (
                        <td key={role.id}>
                          <span className={role.permissions[permission.key] ? "permission-yes" : "permission-no"}>
                            {role.permissions[permission.key] ? <Check size={14} /> : <X size={13} />}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {modalMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalMode(null)}>
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">{modalMode === "create" ? "创建组织成员" : "维护账号资料"}</span>
                <h2 id="user-modal-title">{modalMode === "create" ? "新增用户" : "编辑用户"}</h2>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setModalMode(null)}>
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
                  <span>姓名</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="成员姓名"
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>邮箱地址</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="name@company.com"
                    required
                  />
                </label>
                <label>
                  <span>手机号码</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="可选"
                  />
                </label>
                <label>
                  <span>初始 / 新密码</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={modalMode === "edit" ? "留空表示不修改" : "至少 10 个字符"}
                    required={modalMode === "create" && form.status === "active"}
                  />
                </label>
                <label>
                  <span>所属部门</span>
                  <input
                    value={form.department}
                    onChange={(event) => setForm({ ...form, department: event.target.value })}
                    required
                  />
                </label>
                <label>
                  <span>所属团队</span>
                  <input
                    value={form.team}
                    onChange={(event) => setForm({ ...form, team: event.target.value })}
                    required
                  />
                </label>
                <label>
                  <span>用户角色</span>
                  <select
                    value={form.roleDefinitionId}
                    onChange={(event) => setForm({ ...form, roleDefinitionId: event.target.value })}
                    required
                  >
                    <option value="">请选择角色</option>
                    {roles
                      .filter(
                        (role) =>
                          currentUserRole === "super_admin" ||
                          !["super_admin", "project_admin"].includes(role.baseRole),
                      )
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} · {roleLabels[role.baseRole]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>账号状态</span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}
                  >
                    <option value="active">正常</option>
                    <option value="invited">待激活</option>
                    <option value="disabled">已停用</option>
                  </select>
                </label>
              </div>
              <p className="form-hint">
                待激活账号可以先不设置密码；设为“正常”后必须配置至少 10 位且同时包含字母和数字的密码。项目数和容量由项目成员及工时明细自动计算。
              </p>
              <footer>
                <button type="button" onClick={() => setModalMode(null)}>取消</button>
                <button className="primary-action" type="submit" disabled={saving}>
                  {saving ? "正在保存…" : modalMode === "create" ? "创建用户" : "保存修改"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {roleModalMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRoleModalMode(null)}>
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
                  {roleModalMode === "create" ? "新增访问角色" : "维护访问角色"}
                </span>
                <h2 id="role-modal-title">
                  {roleModalMode === "create" ? "新增角色" : canManageRoles ? "编辑角色" : "角色权限详情"}
                </h2>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setRoleModalMode(null)}>
                <X size={19} />
              </button>
            </header>
            <form onSubmit={submitRole}>
              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <div className="modal-form-grid role-form-grid">
                <label>
                  <span>角色名称</span>
                  <input
                    value={roleForm.name}
                    onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })}
                    placeholder="例如：交付负责人"
                    minLength={2}
                    maxLength={40}
                    required
                    autoFocus={canManageRoles}
                    disabled={!canManageRoles}
                  />
                </label>
                <label>
                  <span>权限基线</span>
                  <select
                    value={roleForm.baseRole}
                    onChange={(event) => {
                      const baseRole = event.target.value as UserRole;
                      const template = systemRoleDefinitions.find((role) => role.baseRole === baseRole);
                      setRoleForm({
                        ...roleForm,
                        baseRole,
                        permissions: template ? { ...template.permissions } : roleForm.permissions,
                      });
                    }}
                    disabled={
                      !canManageRoles ||
                      Boolean(editingRole?.isSystem) ||
                      Boolean(editingRole && editingRole.userCount > 0)
                    }
                  >
                    {systemRoleDefinitions.map((role) => (
                      <option key={role.baseRole} value={role.baseRole}>{role.name}</option>
                    ))}
                  </select>
                </label>
                <label className="form-wide">
                  <span>角色说明</span>
                  <textarea
                    value={roleForm.description}
                    onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })}
                    placeholder="说明该角色的职责和使用范围"
                    maxLength={160}
                    required
                    disabled={!canManageRoles}
                  />
                </label>
                <label>
                  <span>卡片颜色</span>
                  <select
                    value={roleForm.tone}
                    onChange={(event) => setRoleForm({ ...roleForm, tone: event.target.value as RoleTone })}
                    disabled={!canManageRoles}
                  >
                    <option value="violet">紫色</option>
                    <option value="blue">蓝色</option>
                    <option value="green">绿色</option>
                    <option value="orange">橙色</option>
                    <option value="gray">灰色</option>
                  </select>
                </label>
              </div>
              <fieldset className="role-permission-fieldset" disabled={!canManageRoles}>
                <legend>功能权限</legend>
                <div>
                  {rolePermissionDefinitions.map((permission) => (
                    <label key={permission.key}>
                      <input
                        type="checkbox"
                        checked={roleForm.permissions[permission.key]}
                        onChange={(event) => setRoleForm({
                          ...roleForm,
                          permissions: {
                            ...roleForm.permissions,
                            [permission.key]: event.target.checked,
                          },
                        })}
                      />
                      <span>
                        <b>{permission.label}</b>
                        <small>{permission.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="form-hint">
                权限基线决定项目可见范围与任务工作流；已分配用户的角色不能直接修改权限基线。
              </p>
              <footer>
                <button type="button" onClick={() => setRoleModalMode(null)}>
                  {canManageRoles ? "取消" : "关闭"}
                </button>
                {canManageRoles && (
                  <button className="primary-action" type="submit" disabled={savingRole}>
                    {savingRole ? "正在保存…" : roleModalMode === "create" ? "创建角色" : "保存修改"}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><Check size={15} /> {notice}</div>}
    </div>
  );
}
