# FlowBoard Web

标准 Next.js 全栈研发协作平台，覆盖工作台、项目、任务看板和用户权限，可部署到 Vercel。

## 已完成

- 首页登录、退出登录与受保护的管理页面
- 服务端会话：随机令牌、数据库存储、HttpOnly Cookie、过期控制
- 密码安全：Node.js `scrypt` 加盐哈希，不保存明文
- 用户列表、关键指标、搜索、部门/状态筛选、分页与详情
- 新增、编辑、停用、恢复和删除用户
- 超级管理员与项目管理员的服务端权限校验
- 超级管理员、项目管理员、研发成员、测试人员、只读访客五类角色及项目级成员授权
- PostgreSQL 数据模型、Drizzle 迁移和演示数据
- 登录与用户变更审计记录
- 工作台：项目组合进度、任务完成率、逾期风险与工时偏差
- 项目：搜索筛选、新建编辑、状态维护、负责人、周期与安全归档
- 任务看板：五阶段任务流、独立开发/测试负责人、项目与人员筛选、拖拽流转与任务增删改
- 工时管理：预估工时、工时明细自动汇总、剩余或超出工时、实际完成时间
- 迭代：周期、目标、团队容量、任务范围和完成进度
- 工时分析：按项目、成员和日期登记、筛选与分析工时
- 报表：任务状态、项目偏差、成员负载、周趋势与 CSV 导出
- 设置：工作空间、时区、工时规则、完成时间与逾期提醒配置
- 桌面、平板和手机响应式布局
- Vercel 配置及 Open Graph 分享预览图

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- PostgreSQL
- Drizzle ORM / Drizzle Kit
- 原生 Route Handlers 后端 API
- Lucide React 图标

## 本地运行

1. 复制环境变量：

   ```bash
   cp .env.example .env.local
   ```

   Windows PowerShell：

   ```powershell
   Copy-Item .env.example .env.local
   ```

2. 修改 `.env.local` 中的 `DATABASE_URL`。可使用本地 PostgreSQL、Neon 或 Vercel Postgres 的连接串。

3. 安装依赖并初始化数据库：

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. 启动开发服务：

   ```bash
   npm run dev
   ```

5. 打开 `http://localhost:3000`。

本地演示账号默认为：

- 邮箱：`admin@flowboard.local`
- 密码：`Admin@123456`

生产环境必须通过 `SEED_ADMIN_EMAIL` 与 `SEED_ADMIN_PASSWORD` 替换默认账号信息，并将 `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` 设为 `false`。

## 数据库

迁移文件位于 `drizzle/`，包含：

- `users`：账号、资料、角色、状态和最后活跃时间；项目数与容量由关联数据派生
- `sessions`：服务端登录会话
- `audit_logs`：登录及用户管理操作审计
- `projects`：项目代号、负责人、状态、交付周期和归档状态
- `project_members`：项目成员及 manager/member/tester/viewer 项目级角色
- `tasks`：看板状态、优先级、开发负责人、测试负责人、预估工时、实际工时汇总缓存和完成时间
- `sprints`：迭代目标、状态、周期和团队容量
- `work_logs`：成员实际工时明细及任务工时回写
- `workspace_settings`：工作空间和团队协作规则
- `login_rate_limits`：不保存原始邮箱/IP 的持久化登录失败限流

常用命令：

```bash
npm run db:generate
npm run db:preflight
npm run db:migrate
npm run db:seed
npm test
```

## API

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
| PATCH / DELETE | `/api/projects/:id` | 更新 / 归档项目 |
| GET / POST | `/api/tasks` | 获取看板任务 / 创建任务 |
| PATCH / DELETE | `/api/tasks/:id` | 更新任务资料与状态 / 删除无工时历史的任务 |
| GET / POST | `/api/sprints` | 获取迭代组合 / 创建迭代 |
| PATCH / DELETE | `/api/sprints/:id` | 更新 / 删除迭代 |
| PUT | `/api/sprints/:id/tasks` | 规划迭代任务范围 |
| GET / POST | `/api/work-logs` | 查询 / 登记工时 |
| DELETE | `/api/work-logs/:id` | 删除工时并回写任务 |
| GET | `/api/reports` | 获取交付与工时报表 |
| GET / PUT | `/api/settings` | 获取 / 更新工作空间设置 |

所有业务接口都会在服务端验证登录会话和请求来源。普通用户只能访问已加入的项目；项目负责人或项目 manager 维护项目和迭代，研发成员维护自己开发或创建的任务，测试人员维护自己负责验收的任务并登记对应测试工时，只读用户不能写入任务或工时。测试人员不能担任项目负责人或开发负责人。任务实际工时只能由工时明细自动汇总，不能在任务表单中手工修改。

## Vercel 部署

1. 当前仓库根目录就是 Next.js 项目，Vercel Root Directory 使用 `./`。
2. 在 Vercel 中创建或连接 PostgreSQL 数据库。
3. 配置以下环境变量：
   - `DATABASE_URL`
   - `DATABASE_CONNECT_TIMEOUT_SECONDS=30`
   - `SESSION_TTL_DAYS`
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
   - `SEED_DEMO_DATA=false`
4. 在首次发布新代码前，先备份数据库、执行只读预检，再对生产数据库执行迁移：

   ```bash
   npm run db:preflight
   npm run db:migrate
   ```

   `0003_bent_spiral.sql` 会从现有项目负责人、任务负责人/创建人和工时记录回填项目成员，并按工时明细重新校准任务实际工时。若同一项目存在重名迭代，迁移会明确中止，需先清理重复名称。

   `0004_reflective_wrecker.sql` 会增加测试人员的组织角色、项目角色，以及任务测试负责人外键和索引；该迁移不会删除或改写现有业务数据。

5. 仅首次创建生产管理员时执行 `npm run db:seed`。当 `SEED_DEMO_DATA=false` 时只创建管理员和工作空间设置，且强制要求显式配置管理员邮箱和密码；不要把本地演示数据写入生产库。

6. 正常部署即可；Vercel 会自动识别 Next.js。

## 生产建议

- 首次登录后立即替换初始化管理员密码。
- 应用已经提供按邮箱和 IP 散列键的登录限流；仍建议在 Vercel 防火墙或上游网关增加全局速率限制。
- 为生产数据库启用自动备份、连接池和 SSL。
- 发布顺序必须是“数据库备份 → 迁移 → 应用部署 → 登录与关键链路验收”，不能先部署依赖新表的代码。
- 上线后验证不同角色的项目可见范围、开发/测试负责人候选、迭代测试覆盖、测试工时回写、禁用成员和报表汇总口径。
- 后续接入邮件服务后，可将“待激活”账号改为一次性邀请链接流程。
