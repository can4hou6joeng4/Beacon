# Backend Development Guidelines Index

> **Tech Stack**: Next.js 16 App Router API routes + OpenNext Cloudflare Worker + Cloudflare D1 + Cloudflare R2 + PaddleOCR. This project does **not** use Hono, Drizzle, React Router, Vite, Turso, or libSQL for the production app.

## Related Guidelines

| Guideline                 | Location     | When to Read                 |
| ------------------------- | ------------ | ---------------------------- |
| **Shared Code Standards** | `../shared/` | Always - applies to all code |

---

## Documentation Files

| File                                     | Description                                     | When to Read                    |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------- |
| [api-module.md](./api-module.md)         | Next.js API route organization and service boundaries | Creating/modifying API modules  |
| [api-patterns.md](./api-patterns.md)     | Route handler, upload, auth, and OCR patterns   | Implementing API features       |
| [type-safety.md](./type-safety.md)       | Project types, manual validation, provider parsing | Type-related decisions          |
| [database.md](./database.md)             | D1 and SQLite fallback drivers, SQL patterns    | Database operations             |
| [environment.md](./environment.md)       | Environment variables, request context          | Configuration, context patterns |
| [error-logging.md](./error-logging.md)   | Error handling, logging patterns                | Error handling decisions        |
| [hono-framework.md](./hono-framework.md) | Legacy template reference only                  | Avoid for production changes    |
| [security.md](./security.md)             | Authentication, security patterns               | Security implementation         |
| [storage.md](./storage.md)               | R2 object storage and upload artifact handling  | File/object storage             |
| [quality.md](./quality.md)               | Code quality guidelines                         | Before committing               |

---

## Quick Navigation

### API Module Structure

| Task                    | File                                 |
| ----------------------- | ------------------------------------ |
| API route organization  | [api-module.md](./api-module.md)     |
| Directory structure     | [api-module.md](./api-module.md)     |
| Service/lib boundaries  | [api-module.md](./api-module.md)     |
| Route skeletons         | [api-patterns.md](./api-patterns.md) |
| Cloud upload flow       | [api-patterns.md](./api-patterns.md) |
| PaddleOCR flow          | [api-patterns.md](./api-patterns.md) |

### Type Safety

| Task                       | File                               |
| -------------------------- | ---------------------------------- |
| Project domain types       | [type-safety.md](./type-safety.md) |
| Manual validation patterns | [type-safety.md](./type-safety.md) |
| Provider payload parsing   | [type-safety.md](./type-safety.md) |
| Non-null assertions        | [type-safety.md](./type-safety.md) |

### Database (D1 + SQLite Drivers)

| Task                     | File                         |
| ------------------------ | ---------------------------- |
| D1 binding patterns      | [database.md](./database.md) |
| Local SQLite fallback    | [database.md](./database.md) |
| Batch operations         | [database.md](./database.md) |
| No await in loops        | [database.md](./database.md) |
| Workers pitfalls         | [database.md](./database.md) |
| Pagination (cursor/page) | [database.md](./database.md) |

### Error Handling & Logging

| Task                     | File                                   |
| ------------------------ | -------------------------------------- |
| AppError patterns        | [error-logging.md](./error-logging.md) |
| Route catch blocks       | [error-logging.md](./error-logging.md) |
| Provider error mapping   | [error-logging.md](./error-logging.md) |
| Secret-safe logging      | [error-logging.md](./error-logging.md) |

### Environment & Configuration

| Task                        | File                               |
| --------------------------- | ---------------------------------- |
| Worker variables/secrets    | [environment.md](./environment.md) |
| D1/R2 bindings              | [environment.md](./environment.md) |
| OpenNext deployment         | [environment.md](./environment.md) |
| Production smoke checks     | [environment.md](./environment.md) |

### Authentication & Security

| Task                    | File                         |
| ----------------------- | ---------------------------- |
| Authentication patterns | [security.md](./security.md) |
| Token security          | [security.md](./security.md) |
| Session management      | [security.md](./security.md) |
| Quota security          | [security.md](./security.md) |

### Storage & Caching

| Task                 | File                       |
| -------------------- | -------------------------- |
| R2 object keys       | [storage.md](./storage.md) |
| Cloud upload flow    | [storage.md](./storage.md) |
| Artifact download    | [storage.md](./storage.md) |

### Hono Framework

This is retained from the Trellis template but is not part of the current production stack. New API work belongs under `web/src/app/api/**/route.ts`.

### Import Paths & Quality

| Task           | File                       |
| -------------- | -------------------------- |
| Code quality   | [quality.md](./quality.md) |
| ESLint rules   | [quality.md](./quality.md) |
| Review process | [quality.md](./quality.md) |

---

## Core Rules Summary

| Rule                                                        | Reference                                    |
| ----------------------------------------------------------- | -------------------------------------------- |
| **API handlers live in Next.js App Router route files**     | [api-module.md](./api-module.md)             |
| **Separate API orchestration from reusable lib code**       | [api-module.md](./api-module.md)             |
| **Shared types live in `web/src/lib/*-types.ts`**           | [type-safety.md](./type-safety.md)           |
| **No non-null assertions `!`**                              | [type-safety.md](./type-safety.md)           |
| **No await in loops**                                       | [database.md](./database.md)                 |
| **Read Cloudflare bindings through runtime helpers**        | [environment.md](./environment.md)           |
| **Use AppError/jsonError for expected API failures**        | [error-logging.md](./error-logging.md)       |
| **Hash tokens before storing in database**                  | [security.md](./security.md)                 |
| **No `any` types** (use `unknown` if needed)                | [quality.md](./quality.md)                   |
| **Validate API inputs explicitly before side effects**      | [quality.md](./quality.md)                   |
| **Use D1 remotely and SQLite only as local/test fallback**  | [database.md](./database.md)                 |
| **No global scope I/O** (random, fetch, timeout)            | [environment.md](./environment.md)           |

---

## Example Project Structure

```
web/src/
├── app/api/**/route.ts          # Next.js API route handlers
├── app/page.tsx                 # authenticated app shell
├── components/audit/            # audit workbench UI
├── components/auth/             # sign-in/bootstrap UI
├── components/ui/               # shadcn primitives
└── lib/
    ├── audit-*.ts               # audit DB, types, analysis, status helpers
    ├── auth-*.ts                # account/session/quota auth layer
    ├── cloud-object-store.ts    # R2 binding and S3 compatibility helpers
    ├── cloudflare-env.ts        # runtime binding helpers
    ├── paddleocr*.ts            # PaddleOCR config/client/runtime
    └── quota*.ts                # quota ledger and limits
```

---

## Reference Files

| Feature              | Typical Location                    |
| -------------------- | ----------------------------------- |
| Next.js API Route    | `web/src/app/api/**/route.ts`       |
| D1 Audit DB          | `web/src/lib/audit-db-d1.ts`        |
| D1 Auth DB           | `web/src/lib/auth-db-d1.ts`         |
| Local SQLite fallback| `web/src/lib/*-db-sqlite.ts`        |
| Shared Types         | `web/src/lib/*-types.ts`            |
| Auth Service         | `web/src/lib/auth.ts`               |
| Quota Service        | `web/src/lib/quota.ts`              |
| R2/Object Store      | `web/src/lib/cloud-object-store.ts` |
| PaddleOCR Client     | `web/src/lib/paddleocr.ts`          |
| Runtime Env Helpers  | `web/src/lib/cloudflare-env.ts`     |
| Wrangler Config      | `web/wrangler.jsonc`                |
| Next Config          | `web/next.config.ts`                |

---

**Language**: All documentation must be written in **English**.
