# API 摘要

所有接口前缀为 `/api`。首版使用当前会话的演示用户作为操作者，接口已经预留 `actor`、`role` 和审计字段，接入 SSO 时替换身份中间件即可。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/applications` | 申请列表 |
| POST | `/applications` | 新建申请 |
| POST | `/applications/demo` | 创建江苏案例 |
| POST | `/applications/:id/attachments` | 上传附件 |
| POST | `/applications/:id/extract` | 调用本地 OCR/语义适配器 |
| PATCH | `/applications/:id/fields` | 人工确认字段或评分选项 |
| POST | `/applications/:id/score/recalculate` | 重新计算评分和评价 |
| POST | `/applications/:id/submit` | 提交审批 |
| POST | `/applications/:id/approve` | 审批并写入台账 |
| GET | `/ledger` | 投入台账 |
| POST | `/applications/:id/review` | 会后复盘 |
| GET | `/audit-logs` | 审计记录 |
