# V1 → V2 部署和数据切换手册

## 当前已核实与边界

2026-09-16 已核对线上 /M1MRIES/cloud-config.js 与本地归档，均指向 Supabase 项目 liqbfzbrjyvccjcktaxy，表 applications。实际表结构、RLS 和备份恢复仍需项目管理员验证。
V1 代码把业务记录保存在云端和浏览器 localStorage。无法从一个浏览器证明所有使用者的草稿已同步。
V2 使用同一个 PostgreSQL 数据库内的 v2_ 表；不会对 applications 执行 DROP、ALTER 或 UPDATE。
生产运行 Node API，不能用 server/mock.cjs；后者只适合旧本地演示，重启会丢数据。
金额单位为万元、精度四位小数。旧评分保留原分，未知满分不换算百分制。旧状态 saved 映射为 REVIEWING，原始状态始终保留。
V1 用户所属关系缺失时，历史记录仅评估员/审批人可见，绝不按同名申请人自动授权。

## 1. 备份与资料确认

运行 npm run backup。该工具导出正在运行的本地 mock 记录、克隆 V1 git 镜像并生成 gh-pages ZIP、SHA256 清单；有服务凭证时分页导出 applications。
backups/ 与 migration-reports/ 均被 Git 忽略，不得上传它们。
每位使用者在 V1 页面的浏览器 DevTools 中运行 scripts/export-browser-v1.js，导出业务记录。它不会导出登录凭证。
将云端与浏览器导出合并前按 ID 对账；同 ID 不同内容必须人工决定保留版本。
源码分支 HEAD 不能代替“已部署提交”的证明；在 GitHub Pages / Actions 中核对实际 deployment 的提交并记录。

正式全库备份请在受控终端执行：
```bash
# DATABASE_URL 通过受控环境注入，不在共享命令历史中粘贴密码
pg_dump --dbname="$DATABASE_URL" --format=custom --file=backups/v1-before-cutover.dump
pg_restore --list backups/v1-before-cutover.dump
```
必须在独立测试实例恢复并核对后，才能认定备份可恢复。数据库备份不包含 Storage 对象内容：另导出 Storage bucket 文件清单、文件内容及 SHA256，保留原路径；若 V1 不使用 Storage，记录核查结果。
不要把全库恢复到仍有 V2 新数据的生产项目。

## 2. 登录、数据库和附件

在原 Supabase 项目核对 Auth 登录方式与用户 UUID。当前前端实现邮箱/密码登录；若 V1 实际为企业 SSO，先完成对应登录适配再切换。
创建私有 application-attachments bucket，禁止公开访问。
将 .env.example 复制为服务器 .env，填真实值。DATABASE_URL 使用可执行迁移的 PostgreSQL 连接（建议直接连接或 session pooler），不使用 HTTP REST URL。
前端仅用 VITE_SUPABASE_ANON_KEY（公开 anon/publishable key）；service_role 和数据库密码只能放服务器。

```bash
npm ci
npm run db:generate
npm run db:deploy
```
迁移只新增 v2_ 对象并启用 RLS，浏览器没有任何 V2 数据表直读权限；API 校验 Supabase token 后在服务器查角色。
通过管理员 SQL 为已验证用户配置角色：
```sql
INSERT INTO v2_user_access ("userId", role, active)
VALUES ('替换为真实用户UUID', 'APPROVER', true);
```
后续用户分别分配 APPLICANT/EVALUATOR/APPROVER。不要根据用户可编辑的 metadata 分配角色。
生产不运行 db:migrate、reset、db push 或演示种子。db:seed 仅写规则且可重复执行，部署不依赖它。

## 3. 测试迁移与核对

先创建独立测试 PostgreSQL，DATABASE_URL 指向测试库。用户归属文件格式为 {"旧ID":"Supabase用户UUID"}，存入受控备份目录。
```bash
npm run migrate:legacy -- backups/v1-cloud-applications.json --owners=backups/owners.json --batch=trial
# 默认 dry-run 不连接数据库；先审查 migration-reports/trial.json
npm run migrate:legacy -- backups/v1-cloud-applications.json --owners=backups/owners.json --batch=trial-write --apply
npm run migrate:reconcile -- backups/v1-cloud-applications.json
```
导入事务整体提交；任何无效日期、数值、重复 ID 冲突都阻止执行。
已导入记录不覆盖 V2 修改；源记录变化会报冲突，不能静默跳过。在试运行库反复演练，不要把测试导入与正式切换混在一起。
raw_payload 完整保留，附件引用未知时报告待处理，不能认为已迁移附件。
当前 V1 字段未见真实审批记录结构，support_amount 仅作为建议金额，不能复制为审批/实付金额。
测试通过必须包括记录数、四类金额（含空值数量）、状态、旧评分、附件可用性与用户可见范围。

## 4. 云服务器和 HTTPS

建议 x86_64 Linux，至少 4 核/8GB 内存供 CPU OCR，实际容量以压测为准。安装 Docker Engine/Compose，配置 DNS A 记录到服务器，并开放 80/443。数据库和 OCR 不开放公网端口。
使用发布提交作为固定镜像标签：
```bash
docker build -t approval-api:RELEASE .
docker build -f ocr_server/Dockerfile -t approval-ocr:RELEASE .
# .env 设置 API_IMAGE/OCR_IMAGE/API_DOMAIN 及各服务凭证
docker compose run --rm --no-deps api npm run db:deploy
docker compose up -d
docker compose ps
```
也可手动运行 GitHub Build versioned containers workflow，拉取 GHCR 的 commit 标签，随后固定镜像 digest。
Caddy 自动签发证书。OCR 第一次启动会下载模型，需要联网、时间和磁盘空间；health 为进程存活，带内部 token 的 /v1/status 确认模型与 DeepSeek 配置就绪。
API /api/health 检查进程、/api/ready 检查数据库。服务重启由 Compose 托管。
运行完整 PNG/JPG/PDF 样例后才能验收 OCR；配置检查不能替代真实识别测试。
云端不能直接访问 NCC 内网，NCC 通道另行审批配置。

## 5. GitHub 前端发布

仓库 M8MRIES-V2 的 Settings → Secrets and variables → Actions → Variables 配置：
VITE_API_URL=https://实际API域名
VITE_SUPABASE_URL=旧Supabase项目URL
VITE_SUPABASE_ANON_KEY=公开anon key
VITE_BASE_PATH=/M8MRIES-V2/
ENABLE_PAGES_DEPLOY=true

Settings → Pages → Source 选择 GitHub Actions。main 推送通过 PostgreSQL 测试、类型检查、构建后才部署；PR 只检查，不发布。
未配置后端时 ENABLE_PAGES_DEPLOY 保持关闭，避免用不可用页面覆盖已发布站点。
API FRONTEND_ORIGIN 为 https://marketcube2026.github.io（origin 不含 /M1MRIES/ 路径）。
前端构建变量改变后必须重新构建。HTTPS 页面不能请求 HTTP API 或 localhost。

## 6. 正式切换与回退

验收测试地址后，安排停写窗口：V1 浏览器直连 Supabase，必须在数据库侧撤销旧表写权限/禁用写策略，不能只隐藏按钮。具体 SQL 以备份的实际 RLS/权限为准，经测试后执行；继续允许旧版授权读取。
最后导出、备份并核对；生产 V2 表为空时执行首次正式导入，有之前正式导入时先处理源记录差异。
在 V1 发布仓库的独立升级分支准备 V2 构建和 workflow，VITE_BASE_PATH=/M1MRIES/。只改变 V2 仓库 base 不会自动接管 V1 URL。
保存 V1 实际部署 SHA、构建 ZIP、旧 RLS/权限和恢复说明。确认数据库、登录、OCR、审批、台账、复盘都通过后发布 V1 仓库新构建。

回退时先设置 API WRITE_ENABLED=false 并重建 API 容器，导出 V2 表和附件，再恢复 V1 静态构建。V2 新增信息保留在 v2_ 表中。未完成新增数据处置前，V1 保持只读；不得用旧数据库备份覆盖整库。
迁移审核、服务凭证、域名/服务器或附件核对缺失时，不执行正式切换。
