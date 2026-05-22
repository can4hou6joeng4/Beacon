# PDF 证件有效期检查工具

本项目是一个 macOS 本机网页工具，用于上传带书签的 PDF，自动定位证件类书签页，使用 macOS PDFKit/Vision OCR 识别有效期，并按指定截止日期筛出过期风险。

## 启动

### 后台常驻运行（推荐给外部人员访问）

当前已提供 macOS `launchd` 用户服务配置。安装后，Python OCR、Next.js 工作台和 Cloudflare Tunnel 会由系统后台托管，不依赖 Kaku/Codex 终端窗口；只要本机不关机、不重启、网络不断开，服务进程会自动保持运行或异常后重启。

安装或刷新后台服务：

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker
./deploy/local/pdf-audit-service.sh install
```

查看状态：

```bash
./deploy/local/pdf-audit-service.sh status
```

查看日志：

```bash
./deploy/local/pdf-audit-service.sh logs
```

获取当前外网访问地址：

```bash
./deploy/local/pdf-audit-service.sh url
```

重启后台服务：

```bash
./deploy/local/pdf-audit-service.sh restart
```

停止后台服务：

```bash
./deploy/local/pdf-audit-service.sh stop
```

当前已配置 Cloudflare 命名 Tunnel，固定外网入口为：`https://pdf-audit.bobochang.cn/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo`。只要本机、网络、后台服务和 Cloudflare Tunnel 正常，外部用户访问地址不会变化。

### 云端迁移规划

如果希望服务脱离本机常驻和 Cloudflare Tunnel，不能直接把当前 Swift OCR 后端原封不动部署到普通 Linux/serverless 云环境，因为 OCR 核心依赖 macOS `PDFKit`、`Vision`、`AppKit`。推荐路径是保留 `pdf-audit.bobochang.cn` 作为 Cloudflare 前门，将 UI/API、文件存储、历史库迁到云端，并把 OCR 改造成 PaddleOCR-VL 异步 adapter；当前本机 OCR 路径保留为验证和回滚基线。

详细可行性、目标架构、DNS 切换和回滚步骤见：

```bash
docs/operations/cloud-deployment-migration.md
```

### Next.js 审计工作台

推荐使用新的 Next.js 工作台，它在保留本机 OCR 后端的同时提供阶段进度、历史记录、结果分布图和证据下钻。

先启动后端 OCR 服务：

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker
PDF_CHECKER_TOKEN='换成一段足够长的口令' PYTHONPATH=src python3 run_local.py
```

再启动 Next.js 工作台：

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker/web
PDF_CHECKER_TOKEN='同一个口令' PYTHON_AUDIT_BASE_URL='http://127.0.0.1:8787' npm run dev
```

打开：`http://localhost:3000`

固定域名共享给非本局域网用户时，Cloudflare Tunnel 指向 Next.js 端口 `127.0.0.1:3000`。相关配置和排障记录见 `docs/operations/cloudflare-named-tunnel.md`。

临时 quick tunnel 备用命令：

```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000
```

### 旧版静态页面

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker
PYTHONPATH=src python3 run_local.py
```

打开：`http://127.0.0.1:8787`

默认只监听本机 `127.0.0.1`，上传的 PDF 和识别结果保存在项目内 `jobs/<job_id>/` 目录，不会上传到外部服务。

如需通过 Cloudflare Tunnel 临时共享，建议设置访问口令：

```bash
PDF_CHECKER_TOKEN='换成一段足够长的口令' PYTHONPATH=src python3 run_local.py
```

访问时使用服务输出的 `/?token=...` 链接。

## 功能

- 上传 PDF 并输入筛选截止日期。
- 读取 PDF 书签，优先处理注册证、执业注册信息、身份证、资格证、职称证、学历证书、社保等证件页。
- 使用 macOS Vision OCR 识别扫描件文字。
- 输出三类结果：早于截止日期、临近到期、需要人工复核。
- 支持下载 `matches.csv`、`result.json`、`ocr.txt`。

## 本机要求

- macOS，且 Swift 可调用 `PDFKit`、`Vision`、`AppKit`。
- Python 3.14 或兼容版本。
- 浏览器访问本机服务。

## 验证命令

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 - <<'PY'
from pathlib import Path
from pdf_expiry_checker.runner import create_job_dir, run_audit
job = create_job_dir()
result = run_audit(Path('/Users/a1-6/Documents/123.pdf'), '2026-05-22', job)
print(result['summary'])
PY
```
