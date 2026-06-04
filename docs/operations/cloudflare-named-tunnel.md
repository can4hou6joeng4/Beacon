# Retired Cloudflare Named Tunnel Record

This document is historical. It records the retired local Mac + Cloudflare
Tunnel deployment that previously served `pdf-audit.bobochang.cn`.

Current production traffic is served by the Cloudflare Worker custom domain:

```text
pdf-audit.bobochang.cn -> Cloudflare Worker pdf-certificate-expiry-checker
```

Do not use this document to restore production traffic. The repository no
longer contains the local Python OCR service, Swift OCR helper, static local
workbench, or `deploy/local` LaunchAgent/Tunnel scripts.

## Historical State

- Tunnel name: `pdf-certificate-expiry-checker`
- Tunnel ID: `04f3dae6-1d71-4eff-b3e4-a90d61464c42`
- Historical hostname: `pdf-audit.bobochang.cn`
- Historical origin: local Mac, Next.js on port `3000`, Python OCR on port
  `8787`

## Historical Purpose

The Tunnel was used before the service moved fully to Cloudflare Workers. It
provided a stable public hostname for a local Mac-hosted app while the local
machine, local network, `cloudflared`, and macOS LaunchAgents stayed healthy.

That operating model is retired because it tied production availability to a
single local machine and a macOS-only OCR stack.

## Current Operations

Use the Cloudflare-only runbook instead:

```text
docs/operations/cloud-deployment-migration.md
```

Current verification commands:

```bash
curl -I 'https://pdf-audit.bobochang.cn/'
curl -fsS 'https://pdf-audit.bobochang.cn/api/auth/me'
```

Unauthenticated `/api/auth/me` should return `401` JSON.

## Historical DNS Notes

This machine previously saw local DNS/proxy issues with Clash Verge fake IPs.
If a similar problem appears while accessing the current Worker hostname from
this Mac, verify against Cloudflare/public DNS before assuming production is
down:

```bash
dig +short pdf-audit.bobochang.cn
dscacheutil -q host -a name pdf-audit.bobochang.cn
curl -I 'https://pdf-audit.bobochang.cn/'
```

If public Cloudflare responses are healthy but local DNS resolves to `198.18.*`,
check local proxy/DNS configuration rather than reintroducing Tunnel routing.
