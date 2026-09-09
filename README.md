# 审批智评（Approval Insight）

资源支持申请的识别、规则评分、审批、投入台账与会后复盘 MVP。

## 启动

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

前端：http://localhost:5173，API：http://localhost:4000/api/health。

首版 OCR 使用本地可替换适配器；真实 OCR 接入时替换 `POST /api/applications/:id/extract` 的 adapter 即可。规则集中在 `src/rules.ts`，数据库中的 `RuleOption` 和 `AmountBand` 用于后续规则中心配置。演示案例可在总览页点击“载入演示案例”。

## OCR 配置

正式 OCR 通过 OpenAI-compatible Vision API 调用。复制 `.env.example` 为 `.env`，填写 `OCR_ENDPOINT`、`OCR_API_KEY` 和可选的 `OCR_MODEL`。可通过 `GET /api/ocr/status` 检查配置状态。生产环境请将密钥放在部署平台的 secret 中，不要提交到仓库。
