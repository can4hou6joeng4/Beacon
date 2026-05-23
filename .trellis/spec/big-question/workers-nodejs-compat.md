# Cloudflare Workers Node.js Compatibility

> **Severity**: P0 - app fails to build, deploy, or run on Workers.

---

## Current Project Context

This project deploys a Next.js 16 app to Cloudflare Workers through
`@opennextjs/cloudflare`. `web/wrangler.jsonc` is the runtime configuration
source.

The app intentionally uses a small amount of Node-compatible API surface:

- `node:crypto` and `Buffer` in `web/src/lib/cloud-object-store.ts`
- `Buffer` in `web/src/lib/auth-crypto.ts`
- Next/OpenNext runtime internals

Keep `nodejs_compat` enabled unless a task proves every dependency no longer
needs it.

## Compatibility Checklist

Before adding or upgrading a dependency:

1. Check `web/package.json` and `.trellis/spec/shared/dependency-versions.md`.
2. Confirm the package works with React 19, Next.js 16, and OpenNext Cloudflare.
3. Search its docs/issues for Workers or Edge runtime compatibility.
4. Check for runtime imports of unsupported APIs such as `node:fs`,
   `node:child_process`, `node:net`, or native binaries.
5. Run:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
```

## Supported And Risky APIs

| Usually acceptable with `nodejs_compat` | Avoid in Worker runtime |
| --- | --- |
| `node:crypto` | `node:fs` for production storage |
| `node:buffer` / `Buffer` | `node:child_process` |
| `node:util` | `node:net` / raw TCP clients |
| Web Crypto | native Node addons |
| Fetch/Web Streams | local filesystem databases in production |

Local/test-only dependencies such as `better-sqlite3` must not become production
runtime dependencies.

## Common Failure Modes

| Symptom | Likely cause |
| --- | --- |
| `Failed to load url node:*` | Missing compatibility flag or unsupported runtime import |
| Build passes, `cf:build` fails | Package relies on Node-only runtime APIs |
| Local tests pass, deployed route fails | Dependency or helper used local filesystem/process behavior |
| Upload/R2 signing breaks | Crypto/Buffer compatibility changed |

## Current Commands

Use npm, not pnpm:

```bash
cd web
npm run test
npm run lint
npm run build
npm run cf:build
```

Deploy with the authenticated Wrangler session on this machine:

```bash
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
```

## Do Not Do

- Do not add browser polyfills for Node modules unless there is no Workers-native
  or OpenNext-compatible solution.
- Do not move PDF/object storage to local filesystem paths.
- Do not add native Node packages to API routes without verifying `cf:build`.
- Do not switch build tooling to a Vite Worker plugin; this app uses Next.js and
  OpenNext.
