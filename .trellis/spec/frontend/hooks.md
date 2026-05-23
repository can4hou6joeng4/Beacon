# Hook Guidelines

> Local React hook and async-state conventions for the `web/` Next.js app. This
> project does not use React Query.

---

## Current Pattern

Most interactive behavior is still colocated in feature client components:

- `web/src/components/audit/audit-command-center.tsx`
- `web/src/components/audit/admin-user-panel.tsx`
- `web/src/components/audit/result-table.tsx`
- `web/src/components/audit/history-panel.tsx`

Add a custom hook only when the state machine is reused by more than one
component, or when extracting it makes a large component meaningfully easier to
test.

## Naming

Use `use{Feature}{Concern}` names:

| Hook | Use when |
| --- | --- |
| `useAuditPolling` | Status polling becomes shared outside `AuditCommandCenter` |
| `useAuditHistory` | History loading/reloading becomes shared |
| `useAdminUsers` | Admin user loading/editing becomes shared |
| `useQuotaDisplay` | Quota formatting becomes shared |

Keep hook names domain-specific. Avoid generic names like `useData` or
`useApi`.

## Async Fetch Pattern

Use same-origin relative URLs, explicit response typing, and graceful JSON parse
fallbacks.

```ts
type MePayload = {
  user?: PublicUser
  error?: string
}

async function refreshCurrentUser() {
  const response = await fetch("/api/auth/me", { cache: "no-store" })
  if (!response.ok) return
  const payload = (await response.json().catch(() => ({}))) as MePayload
  if (payload.user) setCurrentUser(payload.user)
}
```

Rules:

- Use `cache: "no-store"` for auth, history, job status, quota, or admin data.
- Always type the parsed JSON payload.
- Prefer `payload.error || fallback` for user-facing failures.
- Keep API URLs relative unless the feature truly calls an external origin.

## Upload And Polling State

The production audit flow is a staged client state machine:

1. `POST /api/audit/cloud-uploads` creates a job and upload session.
2. Upload the PDF to the returned R2 URL or Worker upload endpoint.
3. `POST /api/audit/cloud-uploads/paddleocr` submits the OCR job.
4. Poll `/api/audit/jobs/{id}/status` until complete or failed.
5. Load `/api/audit/jobs/{id}/result`.
6. Refresh history and current user quota after quota-changing operations.

When extracting this into a hook, preserve the existing states:

- current job
- stage/progress
- result and distribution
- current user quota
- upload/submission/loading flags
- user-facing error string

Do not hide quota refreshes inside unrelated UI components.

## Retry Pattern

Use bounded retry only for transient network/server failures. The existing
`fetchWithRetries` helper retries `5xx` responses and thrown fetch errors; it
does not retry client errors such as `400`, `401`, `402`, or `409`.

Keep this distinction. Retrying quota exhaustion, auth failure, invalid file
type, or object-key mismatch only creates confusing UI.

## Effects

- Use `useEffect` for initial client-only loads such as admin users.
- Keep dependency arrays explicit.
- Cancel or guard long-running effects if a future hook can outlive the
  component that started it.
- Use `window.setTimeout` for browser polling, not Node timers.

## Memoization

Use `useMemo` for derived lists and display choices that depend on result data:

- filtered valid rows in `ResultTable`
- default result tab
- active user counts
- headline text

Do not memoize simple primitives solely for style.

## Do Not Use

- Do not add React Query/TanStack Query for the current flow.
- Do not create hooks that duplicate API response types.
- Do not fetch inside a component render body.
- Do not store provider tokens or session tokens in hook state.
- Do not use browser storage for session authority; the HttpOnly cookie is the
  authority.
