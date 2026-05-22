# Cloudflare 固定外链运行手册

本文档记录本项目从 `trycloudflare.com` quick tunnel 升级为固定外链的操作流程。

## 目标

- 本机继续运行 Python OCR 服务和 Next.js 工作台。
- Cloudflare Tunnel 不再使用随机 quick tunnel 地址。
- 外部用户使用固定域名访问：`https://pdf-audit.bobochang.cn/?token=...`。
- 本机不主动关机或重启时，后台服务由 macOS `launchd` 持续托管。

## 当前后台服务

后台服务脚本位于：

```bash
/Users/a1-6/Documents/pdf-certificate-expiry-checker/deploy/local/pdf-audit-service.sh
```

运行副本位于：

```bash
/Users/a1-6/Library/Application Support/PdfAuditService/app
```

常用命令：

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker

./deploy/local/pdf-audit-service.sh status
./deploy/local/pdf-audit-service.sh logs
./deploy/local/pdf-audit-service.sh url
./deploy/local/pdf-audit-service.sh restart
./deploy/local/pdf-audit-service.sh stop
```

## 固定外链前提

必须满足以下条件：

- 有 Cloudflare 账号。
- 有一个已经托管到 Cloudflare DNS 的域名。
- 本机 `cloudflared tunnel login` 已完成，并生成：

```bash
~/.cloudflared/cert.pem
```

如果没有 `cert.pem`，不能创建命名 Tunnel。

## 一次性配置流程

### 1. 登录 Cloudflare

```bash
cloudflared tunnel login
```

浏览器中登录 Cloudflare，并选择要用于 Tunnel 的域名。

当前已完成，凭据文件：

```bash
~/.cloudflared/cert.pem
```

### 2. 创建命名 Tunnel

建议名称：

```bash
pdf-certificate-expiry-checker
```

当前已创建：

```text
Tunnel 名称: pdf-certificate-expiry-checker
Tunnel ID: 04f3dae6-1d71-4eff-b3e4-a90d61464c42
```

命令：

```bash
cloudflared tunnel create pdf-certificate-expiry-checker
```

记录输出中的 Tunnel ID。示例：

```text
Created tunnel pdf-certificate-expiry-checker with id <TUNNEL_ID>
```

### 3. 创建 cloudflared 配置

配置文件建议放在：

```bash
/Users/a1-6/Library/Application Support/PdfAuditService/cloudflared/config.yml
```

示例内容：

```yaml
tunnel: 04f3dae6-1d71-4eff-b3e4-a90d61464c42
credentials-file: /Users/a1-6/.cloudflared/04f3dae6-1d71-4eff-b3e4-a90d61464c42.json

ingress:
  - hostname: pdf-audit.bobochang.cn
    service: http://127.0.0.1:3000
    originRequest:
      disableChunkedEncoding: true
      connectTimeout: 30s
      tlsTimeout: 10s
      tcpKeepAlive: 30s
      keepAliveConnections: 20
      keepAliveTimeout: 90s
      noHappyEyeballs: true
  - service: http_status:404
```

其中：

- `<TUNNEL_ID>` 替换为真实 Tunnel ID。
- `<FIXED_HOSTNAME>` 替换为固定域名，例如 `pdf-audit.example.com`。

### 4. 绑定 DNS 路由

```bash
cloudflared tunnel route dns pdf-certificate-expiry-checker pdf-audit.bobochang.cn
```

当前已完成，Cloudflare 已添加 `pdf-audit.bobochang.cn` 到该 Tunnel 的 DNS 路由。

### 5. 修改本项目后台 cloudflared 启动方式

将：

```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000
```

替换为：

```bash
cloudflared tunnel --protocol http2 --config "/Users/a1-6/Library/Application Support/PdfAuditService/cloudflared/config.yml" run pdf-certificate-expiry-checker
```

本机网络环境下 QUIC 曾多次超时，因此固定 Tunnel 也强制使用 `http2`。

对应文件：

```bash
deploy/local/start-cloudflared.sh
```

然后重新安装后台服务：

```bash
./deploy/local/pdf-audit-service.sh install
```

## 验证

### 本机验证

```bash
curl -I 'http://127.0.0.1:3000/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
curl -sS 'http://127.0.0.1:3000/api/audit/history?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
```

### 外网验证

```bash
curl -I 'https://pdf-audit.bobochang.cn/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
curl -sS 'https://pdf-audit.bobochang.cn/api/audit/history?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
```

预期：

- 页面返回 `200`。
- API 返回历史任务 JSON。
- 浏览器可以打开固定域名并看到审计工作台。

当前验证记录：

```bash
cloudflared tunnel info pdf-certificate-expiry-checker
```

显示：

```text
ID: 04f3dae6-1d71-4eff-b3e4-a90d61464c42
CONNECTOR: darwin_arm64 2026.3.0
EDGE: 1xlax01, 1xlax11
```

公网 DoH 解析正常：

```text
pdf-audit.bobochang.cn -> 172.67.162.49, 104.21.15.109
```

固定域名页面和 API 已通过 Cloudflare 公网边缘验证返回 `200`。

## 本机 Clash Verge DNS 排障

如果外部用户可访问，但当前 Mac 打不开固定域名，优先检查本机代理/DNS。当前机器曾出现以下现象：

- Cloudflare Tunnel、Next.js、Python 服务均为 `running`。
- 公网 DoH 返回 Cloudflare IP：`104.21.15.109`、`172.67.162.49`。
- 本机普通 DNS 一度返回 `198.18.0.113`，这是 Clash Verge `fake-ip` 网段。
- `curl --resolve 'pdf-audit.bobochang.cn:443:104.21.15.109' ...` 返回 `200`。

已做的本机修复：

```text
Clash Verge fake-ip-filter: pdf-audit.bobochang.cn
Clash Verge hosts: pdf-audit.bobochang.cn -> 104.21.15.109, 172.67.162.49
/etc/hosts: 104.21.15.109 pdf-audit.bobochang.cn
```

备份文件：

```text
~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/dns_config.yaml.bak-pdf-audit-20260511
~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml.bak-pdf-audit-20260511
~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge-check.yaml.bak-pdf-audit-20260511
```

复核命令：

```bash
dig +short pdf-audit.bobochang.cn
dscacheutil -q host -a name pdf-audit.bobochang.cn
curl -I 'https://pdf-audit.bobochang.cn/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
```

如果 Clash 订阅更新后覆盖配置，本机再次解析到 `198.18.*` 或解析失败，重新添加上述 fake-ip-filter/hosts，或在 `/etc/hosts` 保留 Cloudflare IP 映射。

## Cloudflare 1033 与 TUN 出口修复

2026-05-13 出现过固定域名页面返回 `Error 1033 Cloudflare Tunnel error`。现场判断：

- `127.0.0.1:3000` 本机 Next.js 返回 `200`，业务服务未挂。
- `cloudflared tunnel info pdf-certificate-expiry-checker` 显示没有 active connection。
- cloudflared 日志出现 `TLS handshake with edge error: EOF`。
- `region1.v2.argotunnel.com` / `region2.v2.argotunnel.com` 曾被 Clash fake-ip 解析为 `198.18.*`，后修正为 Cloudflare edge 真实地址 `198.41.*`。
- 在不关闭 Clash Verge TUN 的前提下，临时运行 `cloudflared tunnel --protocol http2 --edge-bind-address 192.168.110.152 ...` 成功注册 4 条 Tunnel connection。

持久修复已写入：

```bash
deploy/local/start-cloudflared.sh
/Users/a1-6/Library/Application Support/PdfAuditService/start-cloudflared.sh
```

核心参数：

```bash
--edge-bind-address 192.168.110.152
```

这个参数让 cloudflared 在 Clash Verge TUN 仍开启时，显式绑定真实网卡 `en0` 的本机地址，而不是让出站连接落到 TUN 源地址 `198.18.0.1`。如果本机切换网络导致 `en0` IP 变化，需要同步更新上述两个启动脚本中的 `--edge-bind-address`。

复核命令：

```bash
cloudflared tunnel info pdf-certificate-expiry-checker
curl -I 'https://pdf-audit.bobochang.cn/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
curl -I 'https://pdf-audit.bobochang.cn/api/audit/history?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
```

恢复后的预期：

- `tunnel info` 显示 active connector。
- 页面和 API 均返回 `HTTP/2 200`。

## 运维说明

固定域名 Tunnel 仍依赖本机在线：

- 本机关机、重启、断网时，外部访问会中断。
- 本机恢复后，`launchd` 会重新拉起服务。
- 命名 Tunnel 的外部域名不应变化。

如果更改了项目源代码，需要重新同步运行副本：

```bash
./deploy/local/pdf-audit-service.sh install
```

## 当前状态记录

- quick tunnel 地址：已切换停用，不再作为主要入口
- 固定域名：`https://pdf-audit.bobochang.cn/?token=l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo`
- Tunnel 名称：`pdf-certificate-expiry-checker`
- Tunnel ID：`04f3dae6-1d71-4eff-b3e4-a90d61464c42`
- Cloudflare 登录状态：已完成
