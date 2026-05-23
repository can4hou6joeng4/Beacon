# Frontend Development Guidelines

> **Tech Stack**: Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui primitives + OpenNext Cloudflare deployment.

## Related Guidelines

| Guideline              | Location      | When to Read                                 |
| ---------------------- | ------------- | -------------------------------------------- |
| **Shared Guidelines**  | `../shared/`  | Always -- coding standards, Git conventions  |
| **Backend Guidelines** | `../backend/` | When working with API integration or types   |

---

## Documentation Files

| File                                             | Description                          | Priority        |
| ------------------------------------------------ | ------------------------------------ | --------------- |
| [directory-structure.md](./directory-structure.md) | Project structure and conventions   | **Must Read**   |
| [type-safety.md](./type-safety.md)               | Type patterns and backend imports    | **Must Read**   |
| [hooks.md](./hooks.md)                           | Local async state, polling, and hook extraction | **Must Read**   |
| [authentication.md](./authentication.md)         | First-party cookie auth integration  | **Must Read**   |
| [components.md](./components.md)                 | UI components, routing, rendering    | Reference       |
| [quality.md](./quality.md)                       | Performance, accessibility, testing  | Reference       |

---

## Quick Navigation by Task

### Before Starting Development

| Task                              | Document                                             |
| --------------------------------- | ---------------------------------------------------- |
| Understand project structure      | [directory-structure.md](./directory-structure.md)    |
| Know type import patterns         | [type-safety.md](./type-safety.md)                   |
| Learn hook conventions            | [hooks.md](./hooks.md)                               |

### During Development

| Task                              | Document                                             |
| --------------------------------- | ---------------------------------------------------- |
| Create custom hooks               | [hooks.md](./hooks.md)                               |
| Build UI components               | [components.md](./components.md)                     |
| Implement authentication          | [authentication.md](./authentication.md)             |
| Ensure type safety                | [type-safety.md](./type-safety.md)                   |

### Before Committing

| Task                              | Document                                             |
| --------------------------------- | ---------------------------------------------------- |
| Check code quality                | [quality.md](./quality.md)                           |
| Verify accessibility              | [quality.md](./quality.md)                           |

---

## Core Rules Summary

| Rule                                          | Reference                                          |
| --------------------------------------------- | -------------------------------------------------- |
| **Import types from backend**                 | [type-safety.md](./type-safety.md)                 |
| **Use `@/` import alias for app/**            | [directory-structure.md](./directory-structure.md)  |
| **Use first-party cookie auth APIs**          | [authentication.md](./authentication.md)           |
| **Use Next.js App Router file conventions**   | [directory-structure.md](./directory-structure.md) |
| **Use semantic HTML**                         | [components.md](./components.md)                   |
| **No `any` type, no `!` assertions**          | [quality.md](./quality.md)                         |
| **Keep upload/OCR state user-visible**        | [quality.md](./quality.md)                         |
| **Keep interactive UI in client components**  | [components.md](./components.md)                   |
| **Use local hooks only when state is reused** | [hooks.md](./hooks.md)                             |

---

## Architecture Overview

```
+----------------------------------------------------------+
|           Cloudflare Worker via OpenNext                  |
|                                                          |
|  Next.js App Router                                      |
|  +--------------------+   +---------------------------+   |
|  | Server Components  |   | app/api/**/route.ts       |   |
|  | auth gate + data   |   | auth, D1, R2, PaddleOCR   |   |
|  +----------+---------+   +-------------+-------------+   |
|             |                           |                 |
|             v                           v                 |
|  +--------------------+   +---------------------------+   |
|  | Client Workbench   |   | Cloudflare D1/R2          |   |
|  | upload, poll, UI   |   | PaddleOCR provider        |   |
|  +--------------------+   +---------------------------+   |
+----------------------------------------------------------+
```

---

## Reference Files

| Feature           | Reference Path                |
| ----------------- | ----------------------------- |
| App Shell         | `web/src/app/page.tsx`        |
| Global CSS        | `web/src/app/globals.css`     |
| API Routes        | `web/src/app/api/**/route.ts` |
| UI Components     | `web/src/components/ui/`      |
| Audit Workbench   | `web/src/components/audit/`   |
| Auth UI           | `web/src/components/auth/`    |
| Shared Utilities  | `web/src/lib/`                |

---

## Examples

Use real project files as examples first:

- `web/src/components/audit/audit-command-center.tsx`
- `web/src/components/audit/result-table.tsx`
- `web/src/components/audit/admin-user-panel.tsx`
- `web/src/components/auth/sign-in-panel.tsx`

The `examples/frontend-design/` directory is retained from Trellis bootstrap
templates. Do not prefer it over current project components.

---

## Getting Started

1. **Read the Must-Read documents** -- directory structure, type safety, hooks, and authentication
2. **Preserve the Next.js App Router shape** -- Follow [directory-structure.md](./directory-structure.md)
3. **Use `@/` alias for `web/src/*`** -- Follow [type-safety.md](./type-safety.md)
4. **Use the first-party auth APIs** -- Follow [authentication.md](./authentication.md)
5. **Build workbench features in `components/audit/`** -- Follow [components.md](./components.md)
6. **Check quality** -- Review [quality.md](./quality.md) before committing

---

**Language**: All documentation must be written in **English**.
