# bobochang.cn 迁移到目标 Cloudflare 账号操作记录

> Historical note: the local named Tunnel described here has been retired for
> production. Current production traffic for `pdf-audit.bobochang.cn` is served
> by the Cloudflare Worker `pdf-certificate-expiry-checker`.

本文档记录 `bobochang.cn` 从当前 Cloudflare 账号迁移到目标 Cloudflare 账号，并最终绑定固定访问域名 `pdf-audit.bobochang.cn` 的操作顺序。

## 当前状态

当前 DNS 查询结果：

```bash
dig +short NS bobochang.cn
```

返回：

```text
everton.ns.cloudflare.com.
kate.ns.cloudflare.com.
```

这说明 `bobochang.cn` 当前已经托管在某个 Cloudflare 账号中，但不是后续希望使用的常用账号。

本机状态：

- `~/.cloudflared/cert.pem` 已生成。
- 当前 Cloudflare 账号已可创建 Tunnel。
- 命名 Tunnel 已创建并绑定 `pdf-audit.bobochang.cn`。

## 关键原则

不要在旧账号中先删除 `bobochang.cn`，除非可以接受 DNS 中断。

更安全的迁移顺序是：

1. 在目标 Cloudflare 账号中添加 `bobochang.cn`。
2. Cloudflare 会为目标账号分配一组新的 nameserver。
3. 到域名注册商后台，把 `bobochang.cn` 的 nameserver 改成目标账号分配的新 nameserver。
4. 等待 DNS 生效。
5. 确认 `dig +short NS bobochang.cn` 已返回目标账号的新 nameserver。
6. 再回旧 Cloudflare 账号删除 `bobochang.cn` Zone。

如果先删除旧账号 Zone，而域名注册商仍指向旧 Cloudflare nameserver，域名解析可能会中断。

## 旧账号解绑步骤

如果你仍可登录当前托管 `bobochang.cn` 的旧 Cloudflare 账号：

1. 打开 Cloudflare Dashboard。
2. 进入 `Websites`。
3. 选择 `bobochang.cn`。
4. 进入 `Overview` 或右侧/底部的站点管理区域。
5. 找到 `Remove site from Cloudflare` / `Delete site`。
6. 仅在目标账号 nameserver 已经生效后执行删除。

## 目标账号接管步骤

在希望长期使用的 Cloudflare 账号中：

1. 打开 Cloudflare Dashboard。
2. 点击 `Add a domain` / `Add site`。
3. 输入：

```text
bobochang.cn
```

4. 选择合适套餐，通常先使用 Free 计划即可。
5. Cloudflare 会扫描 DNS 记录。
6. 确认已有 DNS 记录是否需要保留。
7. 记录 Cloudflare 给出的两个 nameserver。
8. 到域名注册商后台，把 nameserver 改为这两个新值。

## 固定域名规划

目标固定访问域名：

```text
pdf-audit.bobochang.cn
```

目标 Cloudflare 账号接管 `bobochang.cn` 后，再执行：

```bash
cloudflared tunnel login
```

浏览器中选择 `bobochang.cn` 授权，本机会生成：

```bash
~/.cloudflared/cert.pem
```

历史上曾通过本项目的本机 Tunnel 脚本绑定该域名。该本机 Tunnel 运行方式已退役，当前仓库也不再包含 `deploy/local` 脚本。现在应在 Cloudflare 中将 `pdf-audit.bobochang.cn` 绑定到 Worker `pdf-certificate-expiry-checker`。

历史命名 Tunnel 信息：

```text
Tunnel 名称: pdf-certificate-expiry-checker
Tunnel ID: 04f3dae6-1d71-4eff-b3e4-a90d61464c42
固定域名: pdf-audit.bobochang.cn
```

## 验证命令

检查 nameserver 是否已经切到目标账号：

```bash
dig +short NS bobochang.cn
```

检查固定访问域名：

```bash
curl -I 'https://pdf-audit.bobochang.cn/?token=<pdf-checker-token>'
curl -sS 'https://pdf-audit.bobochang.cn/api/audit/history?token=<pdf-checker-token>'
```

预期：

- 页面返回 `200`。
- API 返回历史任务 JSON。

## 当前待办

- [x] 确认 `bobochang.cn` 当前 nameserver。
- [x] 在本机执行 `cloudflared tunnel login` 并选择 `bobochang.cn`。
- [x] 历史阶段曾配置命名 Tunnel 到 `pdf-audit.bobochang.cn`。
- [x] 当前生产入口已迁移为 Cloudflare Worker custom domain。
- [ ] 如仍需要清理旧账号，登录旧 Cloudflare 账号删除其中的 `bobochang.cn` Zone。
