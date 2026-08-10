"use client";

import {
  AlertCircle,
  Check,
  ChevronLeft,
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
import type { UserRole, UserStatus } from "@/db/schema";
import { roleLabels, statusLabels } from "@/lib/users";

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

const roleCards: Array<{
  role: UserRole;
  description: string;
  tone: string;
  permissions: boolean[];
}> = [
  {
    role: "super_admin",
    description: "管理组织、权限、审计及全部项目",
    tone: "violet",
    permissions: [true, true, true, true, true, true],
  },
  {
    role: "project_admin",
    description: "管理指定项目、成员、迭代和报表",
    tone: "blue",
    permissions: [true, true, true, true, true, false],
  },
  {
    role: "member",
    description: "处理任务、记录工时并参与项目协作",
    tone: "green",
    permissions: [false, false, true, false, false, false],
  },
  {
    role: "viewer",
    description: "查看获授权的项目与公开报表",
    tone: "gray",
    permissions: [false, false, false, false, false, false],
  },
];

const permissionRows = [
  "项目设置",
  "用户与团队",
  "任务管理",
  "工时审批",
  "报表导出",
  "系统审计",
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
  const [page, setPage] = useState(1);
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
      pageSize: "20",
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
  }, [department, page, query, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadUsers, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, query]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users],
  );
  const totalPages = Math.max(1, Math.ceil(total / 20));

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
    if (
      !window.confirm(
        `确定删除“${user.name}”吗？此操作会移除该账号及其登录会话。`,
      )
    ) {
      return;
    }

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
          <span>新增用户</span>
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
          <KeyRound size={16} /> 角色与权限 <span>4</span>
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
                      <th>用户</th>
                      <th>部门 / 团队</th>
                      <th>角色</th>
                      <th>账号状态</th>
                      <th>最后活跃</th>
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
                                {roleLabels[user.role]}
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
              <footer className="table-pagination">
                <span>第 {page} / {totalPages} 页</span>
                <div>
                  <button
                    type="button"
                    aria-label="上一页"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="下一页"
                    disabled={page >= totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </footer>
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
                  <div><dt>用户角色</dt><dd>{roleLabels[selectedUser.role]}</dd></div>
                  <div><dt>手机号码</dt><dd>{selectedUser.phone || "未填写"}</dd></div>
                  <div><dt>加入时间</dt><dd>{new Date(selectedUser.createdAt).toLocaleDateString("zh-CN")}</dd></div>
                </dl>
                <section className="capacity-panel">
                  <header><b>本迭代容量</b><span>{selectedUser.capacity}%</span></header>
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
            {roleCards.map((role) => (
              <article className={`role-card tone-${role.tone}`} key={role.role}>
                <header>
                  <span><UserRoundCog size={18} /></span>
                  <b>{stats.total ? Math.max(0, users.filter((user) => user.role === role.role).length) : 0} 人</b>
                </header>
                <h3>{roleLabels[role.role]}</h3>
                <p>{role.description}</p>
                <button type="button" onClick={() => setNotice("角色模板将在后续权限模块开放编辑")}>
                  查看权限详情 <ChevronRight size={14} />
                </button>
              </article>
            ))}
          </div>
          <article className="permission-matrix">
            <header>
              <div>
                <span className="eyebrow">访问控制</span>
                <h3>默认权限矩阵</h3>
              </div>
              <span>RBAC 权限模型</span>
            </header>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>功能权限</th>
                    {roleCards.map((role) => (
                      <th key={role.role}>{roleLabels[role.role]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.map((permission, rowIndex) => (
                    <tr key={permission}>
                      <td>{permission}</td>
                      {roleCards.map((role) => (
                        <td key={role.role}>
                          <span className={role.permissions[rowIndex] ? "permission-yes" : "permission-no"}>
                            {role.permissions[rowIndex] ? <Check size={14} /> : <X size={13} />}
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
                    minLength={8}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={modalMode === "edit" ? "留空表示不修改" : "至少 8 个字符"}
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
                    <option value="viewer">只读访客</option>
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

      {notice && <div className="toast" role="status"><Check size={15} /> {notice}</div>}
    </div>
  );
}
