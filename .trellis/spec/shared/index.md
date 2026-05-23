# Shared Development Guidelines

> Shared rules for this Next.js/OpenNext Cloudflare project.

---

## Documentation Files

| File                                               | Description                               | When to Read               |
| -------------------------------------------------- | ----------------------------------------- | -------------------------- |
| [dependency-versions.md](./dependency-versions.md) | **Critical version pinning requirements** | **Before installing deps** |
| [code-quality.md](./code-quality.md)               | Code quality mandatory rules              | Always                     |
| [typescript.md](./typescript.md)                   | TypeScript best practices                 | Type-related decisions     |
| [timestamp.md](./timestamp.md)                     | Timestamp format specification            | Date/time handling         |

---

## Quick Navigation

| Task                        | File                                               |
| --------------------------- | -------------------------------------------------- |
| **Dependency versions**     | [dependency-versions.md](./dependency-versions.md) |
| Code quality rules          | [code-quality.md](./code-quality.md)               |
| Type annotations            | [typescript.md](./typescript.md)                   |
| Timestamp handling          | [timestamp.md](./timestamp.md)                     |
| Tailwind v4 and shadcn      | [dependency-versions.md](./dependency-versions.md#tailwind-css-v4-and-shadcn) |

---

## Core Rules (MANDATORY)

| Rule                                     | File                                               |
| ---------------------------------------- | -------------------------------------------------- |
| **Check dependency version constraints** | [dependency-versions.md](./dependency-versions.md) |
| No non-null assertions (`!`)             | [code-quality.md](./code-quality.md)               |
| Use explicit type annotations            | [typescript.md](./typescript.md)                   |
| Use project timestamp types              | [timestamp.md](./timestamp.md)                     |

---

## Before Every Commit

- [ ] `npm run test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run cf:build`
- [ ] No non-null assertions (`!`)
- [ ] Dependency versions match constraints in [dependency-versions.md](./dependency-versions.md)

---

## Code Review Checklist

- [ ] Types are explicit, not `any`
- [ ] Error handling is proper
- [ ] Naming follows conventions
- [ ] No duplicate code
- [ ] Dependencies use correct versions
- [ ] Tailwind v4 color mappings present if using shadcn (see [dependency-versions.md](./dependency-versions.md#tailwind-css-v4-gotchas))

---

**Language**: All documentation must be written in **English**.
