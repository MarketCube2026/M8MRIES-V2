# 审批智评 V2

React/Vite 前端、Node/Prisma/PostgreSQL API、PaddleOCR + DeepSeek 内部识别服务。Supabase 提供登录、旧数据库与私有附件存储。

## 开发启动

1. 复制 .env.example 为 .env，填写测试 PostgreSQL、Supabase URL/公开 anon key、服务端 service role key、内部 OCR token。
2. 给登录用户在 v2_user_access 表中分配角色。密钥不能提交 GitHub。
3. 执行：

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run dev
```

本地 VITE_API_URL 可设为空，FRONTEND_ORIGIN 设 http://localhost:5173。正式模式必须配置登录，不使用模拟角色。
另启动 OCR：安装 ocr_server/requirements.txt 后执行 python -m uvicorn ocr_server.main:app --host 127.0.0.1 --port 8100。
OCR_SERVICE_TOKEN 至少 24 字符，Node 与 Python 保持一致；DeepSeek key 仅设置在 OCR 服务环境中。
PDF、PNG、JPEG 支持以实际运行样例验收；首次启动 PaddleOCR 下载模型。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

设置 TEST_DATABASE_URL 为独立测试 PostgreSQL 并执行 db:deploy 后，npm test 会额外运行真实数据库闭环测试。
没有 TEST_DATABASE_URL 时数据库测试会明确跳过，不能据此宣称生产验收完成。
GitHub Actions 使用独立 PostgreSQL 服务执行数据库测试和重复 migration deploy。

## 数据与发布

规则唯一配置在 rules/2026.1.json，当前满分 100；历史评分保留 legacy 版本。
V2 只创建 v2_ 表，不覆盖 V1 applications。原始材料与用户信息不得上传仓库。
迁移前运行 npm run backup；迁移默认 dry-run，--apply 才写数据库。
完整备份、Supabase 权限、迁移对账、Docker/HTTPS、GitHub Pages 和回退步骤见 [部署手册](docs/V2-DEPLOYMENT.md)。

生产 API 使用 npm run start。server/mock.cjs 仅保留作为原本地原型，不用于生产部署。
旧版地址 /M1MRIES/ 需要在旧仓库发布 V2 构建；仅修改 V2 仓库的 base 不会替换旧地址。
