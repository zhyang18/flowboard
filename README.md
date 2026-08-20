# FlowBoard Web

[简体中文](#flowboard-web-简体中文) | [English](#flowboard-web-english)

---

## FlowBoard Web (简体中文)

标准 Next.js 全栈研发协作平台，覆盖工作台、项目组合、迭代规划、任务看板、工时分析、数据报表与多角色权限体系，支持中/英文无缝切换，可一键部署至 Vercel。

### 已完成特性

- **多语言国际化**：支持简体中文与 English 界面即时切换，设置项客户端持久化
- **认证与会话**：服务端会话、随机令牌、数据库存储、HttpOnly Cookie 与过期控制
- **密码安全**：Node.js `scrypt` 加盐哈希，防爆破登录限流，不保存明文
- **用户与权限**：超级管理员、项目管理员、研发成员、测试人员、只读访客五类全局角色与项目级授权
- **工作台**：项目组合进度、任务完成率、逾期风险与工时偏差指标聚合
- **项目管理**：新建/编辑/归档/恢复/受控删除项目，健康度分析与成员指派
- **迭代规划**：迭代周期、团队容量、任务范围规划与完成进度跟踪
- **任务看板**：五阶段任务流（待处理、待开始、进行中、待评审、已完成）、独立开发与测试负责人、拖拽流转
- **工时分析**：预估工时、成员实际工时明细自动汇总、剩余/超支工时分析与实际完成时间回写
- **报表中心**：任务状态分布、项目进度偏差、成员负载分析、周期趋势与 CSV 导出
- **工作空间设置**：工作空间名称、时区、起始日、界面语言、工时规则与逾期提醒策略
- **数据持久化与审计**：PostgreSQL 数据模型、Drizzle 迁移与操作审计日志
- **响应式体验**：桌面、平板与移动端自适应布局

### 技术栈

- **框架与前端**：Next.js 16 App Router + React 19 + TypeScript
- **数据库与 ORM**：PostgreSQL + Drizzle ORM / Drizzle Kit
- **后端架构**：原生 Next.js Route Handlers
- **UI 与图标**：Lucide React + 原生高效 CSS 变量系统

### 本地运行

1. **复制环境变量**：

   Linux / macOS：
   ```bash
   cp .env.example .env.local
   ```

   Windows PowerShell：
   ```powershell
   Copy-Item .env.example .env.local
   ```

2. **配置数据库连接**：
   修改 `.env.local` 中的 `DATABASE_URL`，支持本地 PostgreSQL、Neon 或 Vercel Postgres。

3. **安装依赖并初始化数据库**：

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. **启动开发服务**：

   ```bash
   npm run dev
   ```

5. **打开浏览器**：访问 `http://localhost:3000`。

默认本地演示账号：
- 邮箱：`admin@flowboard.local`
- 密码：`Admin@123456`

> [!NOTE]
> 生产环境必须通过 `SEED_ADMIN_EMAIL` 与 `SEED_ADMIN_PASSWORD` 配置管理员账号，并将 `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` 设为 `false`。

### 数据库

迁移文件位于 `drizzle/`，主要数据表包含：

- `users`：账号信息、资料、角色、状态和最后活跃时间
- `sessions`：服务端登录会话
- `audit_logs`：登录及用户管理操作审计
- `projects`：项目代号、负责人、状态、交付周期和归档状态
- `project_members`：项目成员及 manager/member/tester/viewer 角色
- `tasks`：看板状态、优先级、开发负责人、测试负责人、预估工时与实际工时
- `sprints`：迭代目标、状态、周期和团队容量
- `work_logs`：成员实际工时明细及任务工时回写
- `workspace_settings`：工作空间配置、语言、工时与交付规则
- `login_rate_limits`：持久化登录失败限流

常用命令：
```bash
npm run db:generate    # 生成迁移文件
npm run db:preflight   # 执行数据库只读预检
npm run db:migrate     # 执行数据库迁移
npm run db:seed        # 初始化数据库数据
npm test               # 运行自动化测试
```

### API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 邮箱密码登录 |
| POST | `/api/auth/logout` | 注销当前会话 |
| GET | `/api/auth/session` | 获取当前登录用户 |
| GET | `/api/users` | 用户列表、筛选和统计 |
| POST | `/api/users` | 新增用户 |
| GET | `/api/users/:id` | 获取用户详情 |
| PATCH | `/api/users/:id` | 编辑资料、角色或状态 |
| DELETE | `/api/users/:id` | 删除已停用或待激活账号 |
| GET / POST | `/api/projects` | 获取项目组合 / 创建项目 |
| PATCH / DELETE | `/api/projects/:id` | 更新或恢复项目 / 归档或永久删除项目 |
| GET / POST | `/api/tasks` | 获取看板任务 / 创建任务 |
| PATCH / DELETE | `/api/tasks/:id` | 更新任务资料与状态 / 删除任务 |
| GET / POST | `/api/sprints` | 获取迭代组合 / 创建迭代 |
| PATCH / DELETE | `/api/sprints/:id` | 更新 / 删除迭代 |
| PUT | `/api/sprints/:id/tasks` | 规划迭代任务范围 |
| GET / POST | `/api/work-logs` | 查询 / 登记实际工时 |
| DELETE | `/api/work-logs/:id` | 删除工时并回写任务 |
| GET | `/api/reports` | 获取交付与工时报表 |
| GET / PUT | `/api/settings` | 获取 / 更新工作空间设置 |

### Vercel 部署

1. 根目录即 Next.js 项目，Vercel Root Directory 填 `./`。
2. 创建或绑定 PostgreSQL 数据库。
3. 配置环境变量：`DATABASE_URL`、`SESSION_TTL_DAYS`、`NEXT_PUBLIC_APP_URL`、`SEED_ADMIN_EMAIL`、`SEED_ADMIN_PASSWORD` 等。
4. 在生产发布前执行迁移：`npm run db:preflight` 与 `npm run db:migrate`。
5. 正常部署即可自动识别。

---

## FlowBoard Web (English)

A standard Next.js full-stack R&D collaboration and project management platform covering workbenches, project portfolios, sprint planning, task Kanban boards, time tracking, reporting, and role-based access control (RBAC). Supports instant English/Chinese language switching and is ready for Vercel deployment.

### Features Completed

- **Multi-language Support (i18n)**: Seamless switching between Simplified Chinese and English with client-side preference persistence.
- **Authentication & Sessions**: Server-side sessions, secure random tokens, database storage, HttpOnly cookies, and expiration controls.
- **Password Security**: Node.js `scrypt` salted hashing, brute-force rate limiting, and zero plaintext storage.
- **Users & RBAC**: Five global roles (Super Admin, Project Admin, Developer, Tester, Viewer) and project-level authorization.
- **Workbench**: Aggregated portfolio progress, completion rates, overdue risks, and work-hour deviations.
- **Project Management**: Creation, editing, archiving, restoration, and controlled permanent deletion of projects.
- **Sprint Cadence**: Sprints, team capacity, scope planning, and burn-down progress tracking.
- **Kanban Board**: 5-stage task workflow (Backlog, To Do, In Progress, Review, Done), independent developer and tester assignees, and drag-and-drop transitions.
- **Time Tracking**: Estimated hours, automatic rollup of actual work logs, remaining/overrun hours, and completion timestamps.
- **Reports & Insights**: Status distribution, project deviations, team workload analysis, weekly trends, and CSV export.
- **Workspace Settings**: Workspace profile, timezone, week start day, language selection, work log policies, and overdue alert rules.
- **Persistence & Auditing**: PostgreSQL schema, Drizzle ORM migrations, and operation audit logs.
- **Responsive Design**: Full adaptive layout for desktop, tablet, and mobile devices.

### Tech Stack

- **Framework & Frontend**: Next.js 16 App Router + React 19 + TypeScript
- **Database & ORM**: PostgreSQL + Drizzle ORM / Drizzle Kit
- **Backend Architecture**: Native Next.js Route Handlers
- **Icons & UI**: Lucide React + Modern CSS Variables

### Local Development

1. **Copy Environment Variables**:

   Linux / macOS:
   ```bash
   cp .env.example .env.local
   ```

   Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env.local
   ```

2. **Configure Database Connection**:
   Update `DATABASE_URL` in `.env.local` to point to your local PostgreSQL, Neon, or Vercel Postgres instance.

3. **Install Dependencies & Initialize Database**:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. **Start Development Server**:

   ```bash
   npm run dev
   ```

5. **Open Application**: Navigate to `http://localhost:3000`.

Default demo credentials:
- Email: `admin@flowboard.local`
- Password: `Admin@123456`

### Database

Migration scripts are located in `drizzle/`. Core tables include:

- `users`: Accounts, profiles, roles, statuses, and activity timestamps.
- `sessions`: Server-side login sessions.
- `audit_logs`: Audit records for authentication and user management.
- `projects`: Project codes, owners, statuses, delivery windows, and archive flags.
- `project_members`: Project memberships and roles (manager/member/tester/viewer).
- `tasks`: Kanban status, priority, developers, testers, estimates, and actual hours rollup.
- `sprints`: Sprint goals, statuses, timelines, and team capacity.
- `work_logs`: Member work logs and task hours synchronization.
- `workspace_settings`: Workspace configuration, timezone, language, and alert rules.
- `login_rate_limits`: Rate limiting for failed login attempts without plaintext IP/email.

Common commands:
```bash
npm run db:generate    # Generate migration files
npm run db:preflight   # Perform read-only database preflight check
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed initial admin & workspace settings
npm test               # Run all test suites
```

### REST API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | User login with email and password |
| POST | `/api/auth/logout` | Terminate current session |
| GET | `/api/auth/session` | Get currently logged-in user profile |
| GET | `/api/users` | List, filter, and paginate users |
| POST | `/api/users` | Create a new user |
| GET | `/api/users/:id` | Get user details |
| PATCH | `/api/users/:id` | Update user profile, role, or status |
| DELETE | `/api/users/:id` | Delete disabled or invited user account |
| GET / POST | `/api/projects` | List projects portfolio / Create project |
| PATCH / DELETE | `/api/projects/:id` | Update or restore project / Archive or permanently delete |
| GET / POST | `/api/tasks` | Get tasks / Create task |
| PATCH / DELETE | `/api/tasks/:id` | Update task details and status / Delete task |
| GET / POST | `/api/sprints` | List sprints / Create sprint |
| PATCH / DELETE | `/api/sprints/:id` | Update / Delete sprint |
| PUT | `/api/sprints/:id/tasks` | Plan sprint task scope |
| GET / POST | `/api/work-logs` | Query / Record actual work hours |
| DELETE | `/api/work-logs/:id` | Delete work log and recalculate task hours |
| GET | `/api/reports` | Retrieve delivery and work-hour reports |
| GET / PUT | `/api/settings` | Get / Update workspace configuration |

### Deployment to Vercel

1. Root directory is the Next.js project; set Vercel Root Directory to `./`.
2. Connect or provision a PostgreSQL database in Vercel.
3. Configure environment variables: `DATABASE_URL`, `SESSION_TTL_DAYS`, `NEXT_PUBLIC_APP_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, etc.
4. Run preflight and migrations before production deployment: `npm run db:preflight` and `npm run db:migrate`.
5. Deploy normally; Vercel automatically detects Next.js.

### Production Recommendations

- Rotate the initial admin password immediately after first login.
- Enable automatic database backups, connection pooling, and SSL for PostgreSQL.
- Verify role permissions, tester assignments, work-hour rollups, and reporting metrics across all tiers after launch.
