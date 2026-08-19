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
import { roleLabels, statusLabels } from "@/lib/users";
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
  { value: "violet", label: "紫罗兰", color: "#7456ca" },
  { value: "blue", label: "科技蓝", color: "#2f7df6" },
  { value: "green", label: "翡翠绿", color: "#21a279" },
  { value: "orange", label: "琥珀橙", color: "#e37318" },
  { value: "gray", label: "经典灰", color: "#64748b" },
  { value: "rose", label: "玫瑰红", color: "#e11d48" },
];

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

  // 角色管理相关状态
  const [roles, setRoles] = useState<RoleDefinition[]>(defaultSystemRoles);
  const [roleModalMode, setRoleModalMode] = useState<"create" | "edit" | null>(null);
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
  }, [department, page, pageSize, query, sortBy, sortOrder, status]);

  /**
   * 从服务端加载全部角色定义和关联成员统计。
   *
   * @return 加载完成后的 Promise。
   */
  const loadRoles = useCallback(async () => {
    try {
      const response = await fetch("/api/roles", { cache: "no-store" });
      const result = (await response.json()) as { data?: RoleDefinition[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "加载角色列表失败。");
      if (result.data) {
        setRoles(result.data);
      }
    } catch (roleError) {
      console.error("加载角色列表失败", roleError);
    }
  }, []);

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
   * @return 无返回值。
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
   * @return 无返回值。
   */
  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  /**
   * 打开新建用户表单。
   *
   * @return 无返回值。
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
      if (!response.ok) throw new Error(result.error ?? "保存失败。");

      setModalMode(null);
      setNotice(modalMode === "edit" ? "用户资料已更新" : "新用户已创建");
      await loadUsers();
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
      await loadUsers();
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
   * 打开新建角色模态弹窗。
   *
   * @return 无返回值。
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
   * @return 无返回值。
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
      if (!response.ok) throw new Error(result.error ?? "保存角色失败。");

      setRoleModalMode(null);
      setNotice(isEdit ? "角色配置已更新" : "新角色已创建");
      await loadRoles();
    } catch (saveRoleErr) {
      setError(saveRoleErr instanceof Error ? saveRoleErr.message : "保存角色失败。");
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
      setNotice("系统内置角色不可删除");
      return;
    }
    const confirmed = await confirm({
      title: "删除角色",
      message: `确定删除角色“${role.name}”吗？此操作无法撤销。`,
      confirmLabel: "删除角色",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "删除角色失败。");

      setNotice("角色已删除");
      await loadRoles();
    } catch (delRoleErr) {
      setNotice(delRoleErr instanceof Error ? delRoleErr.message : "删除角色失败。");
    }
  }

  /**
   * 切换角色表单中特定权限的勾选状态。
   *
   * @param index 权限在 permissionRows 中的索引。
   * @return 无返回值。
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
          <span className="eyebrow">组织成员</span>
          <h2>用户管理</h2>
          <p>集中维护成员资料、团队归属、账号状态与访问权限。</p>
        </div>
        {tab === "users" ? (
          <button className="primary-action" type="button" onClick={openCreate}>
            <Plus size={17} />
            <span>新建用户</span>
          </button>
        ) : (
          currentUserRole === "super_admin" && (
            <button className="primary-action" type="button" onClick={openCreateRole}>
              <Plus size={17} />
              <span>新增角色</span>
            </button>
          )
        )}
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

          {error && !modalMode && !roleModalMode && (
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
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("name")}
                        title="点击按姓名排序"
                      >
                        <div className="th-content">
                          <span>用户</span>
                          {renderSortIcon("name")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("department")}
                        title="点击按部门排序"
                      >
                        <div className="th-content">
                          <span>部门 / 团队</span>
                          {renderSortIcon("department")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("role")}
                        title="点击按角色排序"
                      >
                        <div className="th-content">
                          <span>角色</span>
                          {renderSortIcon("role")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("status")}
                        title="点击按账号状态排序"
                      >
                        <div className="th-content">
                          <span>账号状态</span>
                          {renderSortIcon("status")}
                        </div>
                      </th>
                      <th
                        className="sortable-th"
                        onClick={() => handleSort("lastSeenAt")}
                        title="点击按最后活跃时间排序"
                      >
                        <div className="th-content">
                          <span>最后活跃</span>
                          {renderSortIcon("lastSeenAt")}
                        </div>
                      </th>
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
                                {roleLabels[user.role] ?? user.role}
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
                  <div><dt>用户角色</dt><dd>{roleLabels[selectedUser.role] ?? selectedUser.role}</dd></div>
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
          <div className="role-card-grid">
            {roles.map((role) => (
              <article className={`role-card tone-${role.tone}`} key={role.id}>
                <header>
                  <span><UserRoundCog size={18} /></span>
                  <b>{role.userCount ?? 0} 人</b>
                </header>
                <div className="role-card-body">
                  <div className="role-title-row">
                    <h3>{role.name}</h3>
                    {role.isSystem && <span className="system-role-tag">系统预设</span>}
                  </div>
                  <p>{role.description || "暂无描述"}</p>
                </div>
                <div className="role-card-footer">
                  {currentUserRole === "super_admin" ? (
                    <div className="role-card-actions">
                      <button
                        type="button"
                        className="role-action-button"
                        onClick={() => openEditRole(role)}
                        title="编辑角色信息与权限"
                      >
                        <Edit3 size={13} />
                        <span>编辑权限</span>
                      </button>
                      {!role.isSystem && (
                        <button
                          type="button"
                          className="role-action-button danger"
                          onClick={() => deleteRole(role)}
                          title="删除此角色"
                        >
                          <Trash2 size={13} />
                          <span>删除</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="role-view-only-hint">
                      <ShieldCheck size={13} /> 只读查看
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <article className="permission-matrix">
            <header>
              <div>
                <span className="eyebrow">访问控制</span>
                <h3>功能权限矩阵</h3>
              </div>
              <span>RBAC 角色访问控制模型</span>
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
                  {permissionRows.map((permission, rowIndex) => (
                    <tr key={permission}>
                      <td>{permission}</td>
                      {roles.map((role) => {
                        const hasPermission = Boolean(role.permissions[rowIndex]);
                        return (
                          <td key={role.id}>
                            <span className={hasPermission ? "permission-yes" : "permission-no"}>
                              {hasPermission ? <Check size={14} /> : <X size={13} />}
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
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
                  >
                    {currentUserRole === "super_admin" && (
                      <option value="super_admin">超级管理员</option>
                    )}
                    {currentUserRole === "super_admin" && (
                      <option value="project_admin">项目管理员</option>
                    )}
                    <option value="member">研发成员</option>
                    <option value="tester">测试人员</option>
                    <option value="viewer">只读访客</option>
                    {roles
                      .filter((r) => !["super_admin", "project_admin", "member", "tester", "viewer"].includes(r.id))
                      .map((customRole) => (
                        <option key={customRole.id} value={customRole.id}>
                          {customRole.name}
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

      {/* 角色新增/编辑模态框 */}
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
                <span className="eyebrow">{roleModalMode === "create" ? "创建自定义角色" : "配置角色权限"}</span>
                <h2 id="role-modal-title">{roleModalMode === "create" ? "新增角色" : "编辑角色"}</h2>
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
              <div className="modal-form-grid">
                <label>
                  <span>角色名称</span>
                  <input
                    value={roleForm.name}
                    onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })}
                    placeholder="如：技术总监、敏捷教练、运维专家"
                    required
                    maxLength={30}
                    autoFocus
                  />
                </label>
                <label>
                  <span>主题色调</span>
                  <select
                    value={roleForm.tone}
                    onChange={(event) => setRoleForm({ ...roleForm, tone: event.target.value })}
                  >
                    {toneOptions.map((tone) => (
                      <option key={tone.value} value={tone.value}>
                        {tone.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full-width">
                  <span>角色职责描述</span>
                  <input
                    value={roleForm.description}
                    onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })}
                    placeholder="简述该角色的职责范畴与权限分配目标"
                    maxLength={200}
                  />
                </label>
              </div>

              <div className="role-permissions-config">
                <h4>功能权限勾选</h4>
                <div className="permissions-checkbox-grid">
                  {permissionRows.map((perm, idx) => (
                    <label key={perm} className="permission-check-item">
                      <input
                        type="checkbox"
                        checked={Boolean(roleForm.permissions[idx])}
                        onChange={() => toggleRolePermission(idx)}
                      />
                      <span>{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              <footer>
                <button type="button" onClick={() => setRoleModalMode(null)}>取消</button>
                <button className="primary-action" type="submit" disabled={savingRole}>
                  {savingRole ? "正在保存…" : roleModalMode === "create" ? "创建角色" : "保存权限"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><Check size={15} /> {notice}</div>}
    </div>
  );
}
