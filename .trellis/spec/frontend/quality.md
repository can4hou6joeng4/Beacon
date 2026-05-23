# Frontend Quality Guidelines

> Quality checks and UI standards for the Next.js/OpenNext audit console.

---

## Required Checks

Run from `web/` before committing frontend changes:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
```

For docs-only changes under `.trellis/spec/`, `git diff --check` is the minimum
required check.

## Framework Rules

- This is Next.js 16 App Router. Read `web/AGENTS.md` and local Next docs under
  `web/node_modules/next/dist/docs/` before framework-sensitive edits.
- Use `@/` imports for `web/src/*`.
- Keep production deployment compatible with OpenNext Cloudflare Workers.
- Do not introduce Vite, React Router, or client-side route registration.

## TypeScript

- No `any`; use explicit project types or `unknown` plus narrowing.
- No non-null assertions.
- Type API payloads and component props.
- Keep domain types in `web/src/lib/*-types.ts` or existing shared type files.
- Do not duplicate backend response types in multiple components.

## UI Quality

- The app is an operational audit console. Favor dense, readable panels over
  decorative marketing layouts.
- Text must fit on mobile and desktop. Use wrapping, clamping, scroll containers,
  and stable grid tracks for long OCR evidence, filenames, emails, and quota
  values.
- Use shadcn primitives already present in `web/src/components/ui/`.
- Use lucide icons in buttons where available.
- Include accessible labels for icon-only controls.
- Do not render OCR/provider text as raw HTML.

## Async UX

- Display clear user-facing errors from `payload.error`.
- Keep upload/OCR progress visible through staged state.
- Refresh current user quota after upload session creation, OCR submission, and
  completed result loading.
- Do not retry expected client failures such as `401`, `402`, `409`, invalid
  file type, or quota exhaustion.
- Keep PaddleOCR and R2 details behind same-origin API calls; persistent UI
  should not expose secrets or long-lived provider URLs.

## Accessibility

- Use semantic HTML: `button` for actions, `label` for inputs, `main` for the
  app content, and `section` for grouped content.
- Preserve heading order inside dialogs and major panels.
- Keep focusable controls visible and reachable.
- Dialogs should include a title and, when helpful, a description.

## Dependency Discipline

Before adding a frontend dependency:

1. Search `web/src/components/ui/` and existing helpers.
2. Confirm it works with React 19, Next.js 16, and OpenNext Cloudflare.
3. Check runtime size and whether it imports Node-only APIs.
4. Add focused tests for parsing, formatting, or state machines it changes.

Do not add React Query, Better Auth UI, or a new component library just because a
generic recipe suggests it.
