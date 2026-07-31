# FlowBoard Web

标准 Next.js 全栈研发协作平台，覆盖工作台、项目、任务看板和用户权限，可部署到 Vercel。

## 已完成

- 首页登录、退出登录与受保护的管理页面
- 服务端会话：随机令牌、数据库存储、HttpOnly Cookie、过期控制
- 密码安全：Node.js `scrypt` 加盐哈希，不保存明文
- 用户列表、关键指标、搜索、部门/状态筛选、分页与详情
- 新增、编辑、停用、恢复和删除用户
- 超级管理员与项目管理员的服务端权限校验
- 角色权限矩阵
- PostgreSQL 数据模型、Drizzle 迁移和演示数据
- 登录与用户变更审计记录
- 工作台：项目组合进度、任务完成率、逾期风险与工时偏差
- 项目：搜索筛选、新建编辑、状态维护、负责人、周期与安全归档
- 任务看板：五阶段任务流、项目/负责人筛选、拖拽流转与任务增删改
- 工时管理：预估工时、实际工时、剩余或超出工时、实际完成时间
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

- `users`：账号、资料、角色、状态、容量和最后活跃时间
- `sessions`：服务端登录会话
- `audit_logs`：登录及用户管理操作审计
- `projects`：项目代号、负责人、状态、交付周期和归档状态
- `tasks`：看板状态、优先级、负责人、预估/实际工时和完成时间
- `sprints`：迭代目标、状态、周期和团队容量
- `work_logs`：成员实际工时明细及任务工时回写
- `workspace_settings`：工作空间和团队协作规则

常用命令：

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
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
| PATCH / DELETE | `/api/tasks/:id` | 更新状态与工时 / 删除任务 |
| GET / POST | `/api/sprints` | 获取迭代组合 / 创建迭代 |
| PATCH / DELETE | `/api/sprints/:id` | 更新 / 删除迭代 |
| PUT | `/api/sprints/:id/tasks` | 规划迭代任务范围 |
| GET / POST | `/api/work-logs` | 查询 / 登记工时 |
| DELETE | `/api/work-logs/:id` | 删除工时并回写任务 |
| GET | `/api/reports` | 获取交付与工时报表 |
| GET / PUT | `/api/settings` | 获取 / 更新工作空间设置 |

所有业务接口都会在服务端验证登录会话；项目维护和用户管理还会校验管理角色。

## Vercel 部署

1. 将 `web` 目录作为 Vercel 项目的 Root Directory。
2. 在 Vercel 中创建或连接 PostgreSQL 数据库。
3. 配置以下环境变量：
   - `DATABASE_URL`
   - `SESSION_TTL_DAYS`
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
4. 在首次发布前，对生产数据库执行：

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. 正常部署即可；Vercel 会自动识别 Next.js。

## 生产建议

- 首次登录后立即替换初始化管理员密码。
- 在 Vercel 防火墙或上游网关配置登录接口限流。
- 为生产数据库启用自动备份、连接池和 SSL。
- 后续接入邮件服务后，可将“待激活”账号改为一次性邀请链接流程。
