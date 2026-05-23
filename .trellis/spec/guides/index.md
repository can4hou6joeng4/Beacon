# Thinking Guides

> **Purpose**: Systematic thinking guides to catch issues before they become bugs in Cloudflare Workers full-stack applications.
>
> **Core Philosophy**: 30 minutes of thinking saves 3 hours of debugging.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about serverless connection lifecycle -> stale connection zombies
- Didn't think about platform limits -> SSE fails after 2.5 minutes
- Didn't think about route namespace conflicts -> API and app routes disagree
- Didn't think about provider limits -> OCR quota math drifts from PaddleOCR limits

These guides help you **ask the right questions before coding**.

---

## Available Thinking Guides

| Guide | Purpose | When to Use |
| --- | --- | --- |
| [Serverless Connection Guide](./serverless-connection-guide.md) | Debug and prevent connection issues in serverless environments | Random "connection closed" or "Failed query" errors |
| [OAuth Consent Flow](./oauth-consent-flow.md) | Design pattern for OAuth 2.1 authorization with resource selection | Implementing OAuth flows requiring resource-level consent |

---

## Quick Reference: When to Use Which Guide

### Connection and Database Issues

Use [Serverless Connection Guide](./serverless-connection-guide.md) when:

- [ ] Random "Failed query" errors that work on retry
- [ ] Errors appear after periods of inactivity
- [ ] CLI works fine but deployed code fails
- [ ] SSE/WebSocket long connections fail mid-stream
- [ ] Errors like "connection closed", "ECONNRESET", "socket hang up"
- [ ] SSE works for ~2-3 minutes then all DB queries fail (subrequest limit)
- [ ] Using module-level cached database client
- [ ] Using connection pools in serverless
- [ ] Long-running connections (SSE, WebSocket)
- [ ] Singleton patterns for external service clients

### Authentication and Authorization

Use [OAuth Consent Flow](./oauth-consent-flow.md) when:

- [ ] OAuth token needs resource scope (workspace, organization, project)
- [ ] Route conflicts between API routes and frontend routes
- [ ] Implementing OAuth 2.1 with PKCE for external clients
- [ ] Building consent UI with resource selection
- [ ] Designing OAuth token/client storage for a future OAuth task

The current project does not use OAuth. For normal account auth, prefer
`../frontend/authentication.md` and `../backend/security.md`.

---

## The Pre-Modification Rule (CRITICAL)

> **Before changing ANY value, ALWAYS search first!**

```bash
# Search for the value you're about to change
rg "value_to_change" --type ts

# Check how many files reference this value
rg "CONFIG_NAME" --type ts -c
```

This single habit prevents most "forgot to update X" bugs.

---

## Cloudflare Workers-Specific Layers

In this project, the production layers are:

```
Next.js Server Component App Shell
        |
        v
Client Audit Workbench
        |
        v
Next.js API Routes (app/api/**/route.ts)
        |
        v
Service Layer (auth, quota, audit, provider parsing)
        |
        v
Data/Provider Layer (D1, R2, PaddleOCR)
```

Each boundary is a potential source of bugs due to:

- **Route conflicts** - API route mounting swallows frontend paths
- **Serverless lifecycle** - Connections go stale between request reuse
- **Platform limits** - 50 subrequest limit (Free), CPU time limits
- **Serialization** - provider JSONL and OCR markdown must be parsed before UI use
- **Environment bindings** - D1/R2 bindings must come through OpenNext helpers

---

## Core Principles

1. **Connection Freshness > Connection Reuse** - In serverless, fresh connections beat cached ones
2. **Search Before Write** - Always search for existing patterns before creating new ones
3. **Think Before Code** - 5 minutes of checklist saves 50 minutes of debugging
4. **Test Deployed, Not Just Local** - Local dev hides serverless-specific bugs
5. **Learn From Bugs** - Add lessons to these guides after fixing non-trivial bugs

---

## Contributing

Found a new "didn't think of that" moment? Add it:

1. If it's a **general thinking pattern** -> Add to existing guide or create new one
2. If it caused a bug -> Add to "Lessons Learned" section in the relevant guide
3. If it's **project-specific** -> Create a separate project-specific guide

---

**Language**: All documentation must be written in **English**.
