# PDF Certificate Expiry Checker Development Guidelines

Production development guidelines for the Next.js/OpenNext Cloudflare audit
application.

## Structure

### [Backend](./backend/index.md)

Next.js App Router API routes, Cloudflare D1/R2, PaddleOCR, auth, and quota
patterns:

- [API Module](./backend/api-module.md)
- [API Patterns](./backend/api-patterns.md)
- [Database](./backend/database.md)
- [Environment](./backend/environment.md)
- [Error & Logging](./backend/error-logging.md)
- [Hono Framework](./backend/hono-framework.md) (legacy template note only)
- [Quality Checklist](./backend/quality.md)
- [Security](./backend/security.md)
- [Storage](./backend/storage.md)
- [Type Safety](./backend/type-safety.md)

### [Frontend](./frontend/index.md)

Next.js 16 App Router + React 19 + Tailwind CSS v4 + shadcn/ui frontend
patterns:

- [Authentication](./frontend/authentication.md)
- [Components](./frontend/components.md)
- [Directory Structure](./frontend/directory-structure.md)
- [Hooks](./frontend/hooks.md)
- [Quality Checklist](./frontend/quality.md)
- [Type Safety](./frontend/type-safety.md)
- [Examples: Frontend Design](./frontend/examples/frontend-design/)

### [Shared](./shared/index.md)

Cross-cutting concerns:

- [Code Quality](./shared/code-quality.md)
- [Dependency Versions](./shared/dependency-versions.md)
- [TypeScript Conventions](./shared/typescript.md)
- [Timestamp](./shared/timestamp.md)

### [Guides](./guides/index.md)

Development thinking guides and design patterns:

- [OAuth Consent Flow](./guides/oauth-consent-flow.md)
- [Serverless Connection Guide](./guides/serverless-connection-guide.md)

### [Common Issues / Pitfalls](./big-question/index.md)

Common issues and solutions for Cloudflare Workers applications:

- [Workers Node.js Compatibility](./big-question/workers-nodejs-compat.md)
- [Cross-Layer Contract](./big-question/cross-layer-contract.md)
- [CSS Debugging Thinking Guide](./big-question/css-debugging-thinking-guide.md)
- [Environment Configuration](./big-question/env-configuration.md)
- [System Constraints](./big-question/system-constraints.md)

## Tech Stack

- **Runtime**: Cloudflare Workers through OpenNext
- **Backend**: Next.js 16 App Router API routes
- **Database**: Cloudflare D1, with SQLite fallback for local/test code paths
- **Frontend**: React 19, Tailwind CSS v4, shadcn/ui primitives
- **Auth**: first-party HttpOnly cookie sessions
- **Storage**: Cloudflare R2
- **OCR Provider**: PaddleOCR async API
- **Build**: Next.js + `@opennextjs/cloudflare` + Wrangler v4
- **Language**: TypeScript throughout

## Usage

These guidelines can be used as:

1. **Reference Documentation** - Consult specific guides when implementing features
2. **Code Review Checklist** - Verify implementations against established patterns
3. **Onboarding Material** - Help new developers understand project conventions
4. **Trellis Context** - Future tasks should load these specs instead of generic templates
