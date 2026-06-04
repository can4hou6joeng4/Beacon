# PDF 证件有效期检查工具

本项目是一个云端 PDF 证件有效期审计工具。用户上传带书签的 PDF 后，系统会将文件写入 Cloudflare R2，使用 PaddleOCR 异步识别证件页文本，将结果写入 Cloudflare D1/R2，并按指定截止日期输出过期风险、临近到期和需要人工复核的项目。

生产入口：

```text
https://pdf-audit.bobochang.cn
```

当前生产运行时已经退役本机 Python/macOS OCR 服务，不再依赖 macOS PDFKit/Vision、`launchd`、Cloudflare Tunnel、根目录 Python 服务或本机静态页面。

## 架构

- `web/`：Next.js 16 App Router 应用，通过 OpenNext 部署到 Cloudflare Workers。
- Cloudflare D1：保存用户、会话、额度、任务历史和任务状态。
- Cloudflare R2：保存上传 PDF、PaddleOCR 原始 JSONL、`ocr.txt`、`matches.csv` 和 `result.json`。
- PaddleOCR：异步 OCR provider，默认模型为 `PaddleOCR-VL-1.5`。
- 旧本机 OCR API 路由保留为兼容信号，会返回 `410` 并提示使用云端上传流程。

## 本地开发

```bash
cd /Users/bobochang/Documents/pdf-certificate-expiry-checker/web
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

本地开发默认使用 SQLite fallback。生产行为以 Cloudflare D1/R2/PaddleOCR 为准，涉及绑定、对象存储、OCR provider 或部署的改动需要额外运行 Cloudflare build。

## Cloudflare 部署

生产配置在：

```text
web/wrangler.jsonc
web/env.cloud.example
web/migrations/
```

常用命令：

```bash
cd /Users/bobochang/Documents/pdf-certificate-expiry-checker/web
npm run test
npm run lint
npm run build
npm run cf:build
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
```

`env -u CLOUDFLARE_API_TOKEN` 用于让 Wrangler 使用本机浏览器登录态，避免误用过期或权限不足的环境变量 token。

必须通过 Cloudflare secret/config 管理生产密钥，不要写入仓库：

- `AUTH_BOOTSTRAP_TOKEN`
- `PADDLEOCR_API_TOKEN`
- `AUDIT_OBJECT_ACCESS_KEY_ID`
- `AUDIT_OBJECT_SECRET_ACCESS_KEY`

## 功能

- 上传 PDF 并输入筛选截止日期。
- 将 PDF 写入 R2，并提交 PaddleOCR 异步解析。
- 从 PaddleOCR markdown/JSONL 中提取证件有效期。
- 输出早于截止日期、临近到期、需要人工复核和有效项目统计。
- 支持历史记录、重新分析、下载 `matches.csv`、`result.json` 和 `ocr.txt`。
- 支持用户登录、管理员用户管理和上传/OCR 额度控制。

## 验证

本地代码验证：

```bash
cd /Users/bobochang/Documents/pdf-certificate-expiry-checker/web
npm run test
npm run lint
npm run build
npm run cf:build
```

生产烟测：

```bash
curl -I https://pdf-audit.bobochang.cn/
curl -fsS https://pdf-audit.bobochang.cn/api/auth/me
```

未登录访问 `/api/auth/me` 应返回 `401` JSON；如果无有效 session 却返回 `200`，属于认证回归。

## 运维文档

- `docs/operations/cloud-deployment-migration.md`：当前 Cloudflare-only 架构、部署和回滚说明。
- `docs/operations/cloudflare-named-tunnel.md`：已退役的本机 Tunnel 历史记录，仅用于追溯。
- `docs/operations/bobochang-cn-cloudflare-migration.md`：域名迁移历史记录。
