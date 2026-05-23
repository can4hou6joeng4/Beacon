# Security Guidelines

> Authentication, authorization, token handling, quota safety, and provider
> secret handling for the Cloudflare production app.

---

## Auth Boundary

The project uses first-party account auth:

- `web/src/lib/auth.ts`
- `web/src/lib/auth-crypto.ts`
- `web/src/lib/auth-db-d1.ts`
- `web/src/lib/auth-types.ts`

Session cookie:

- name: `pdf_audit_session`
- HttpOnly
- SameSite=Lax
- Secure on HTTPS/production
- raw token visible only at login so the route can set the cookie
- token hash stored in D1

Do not restore the retired shared URL token gate for normal access.

## Admin Rules

- Public signup is out of scope.
- Only admins can create, update, disable, or promote users.
- The first admin can be bootstrapped only while the `users` table is empty.
- Bootstrap requires `AUTH_BOOTSTRAP_TOKEN`; missing config fails with `503`.
- Admin UI must prevent self-disable, and the server remains the authority.
- Admin-created accounts use a username/account identifier, not an email-only
  login. The canonical login column is `users.username`.

## Password And Session Tokens

Reference: `web/src/lib/auth-crypto.ts`.

- Passwords use PBKDF2/SHA-256 with per-user salt and stored iteration count.
- `PASSWORD_ITERATIONS` is currently `100_000`; keep it Cloudflare-compatible.
- Session tokens use 32 bytes of cryptographic randomness and base64url output.
- Session tokens are hashed with SHA-256 before storage.
- Use timing-safe comparison for password hash checks.

Never log raw passwords, raw session tokens, bootstrap tokens, PaddleOCR tokens,
or R2 secrets.

## Username Account Contract

### 1. Scope / Trigger

- Trigger: first-party auth login and account creation cross the API, service,
  database, and frontend boundaries.

### 2. Signatures

- `loginWithPassword({ login, password, userAgent })`
- `AuthDb.getUserByLogin(login)`
- `CreateUserInput.username`
- `users.username TEXT UNIQUE`

### 3. Contracts

- Username is the required account identifier for new users.
- Normalize usernames with `normalizeUsername(...)` before insert or lookup.
- Keep optional email as compatibility metadata only; do not require it for
  login, admin creation, or bootstrap.
- If the D1 `email` column remains `NOT NULL` for compatibility, generate a
  non-public placeholder such as `{username}@local.invalid` when no email is
  provided.

### 4. Validation & Error Matrix

| Condition | Error |
| --- | --- |
| Invalid username shape | `400 INVALID_USERNAME` |
| Duplicate username or compatibility email | `409 USER_EXISTS` |
| Missing/wrong password or disabled user | `401 INVALID_CREDENTIALS` |

### 5. Good/Base/Bad Cases

- Good: `bobochang` is accepted and normalized to `bobochang`.
- Base: `Bobochang` normalizes to `bobochang`.
- Bad: short or symbol-prefixed usernames fail before hashing.

### 6. Tests Required

- Auth service rejects invalid usernames.
- Auth DB can create and retrieve users by username.
- Session lookup still returns `PublicUser.username`.

### 7. Wrong vs Correct

#### Wrong

```ts
await db.getUserByEmail(input.email)
```

#### Correct

```ts
await db.getUserByLogin(input.login)
```

## Job Ownership

Normal users can read, poll, submit, and download only their own audit jobs.
Admins may manage users, but audit job access should still be explicit in the
DB/service layer rather than inferred from UI state.

Protected routes should call `requireAuth(request)` or `requireAdmin(request)`
before loading sensitive rows or objects.

## Quota Security

Quota resources:

- `upload_bytes`
- `ocr_jobs`
- `ocr_pages`

Rules:

- Reserve upload bytes before issuing/accepting an upload.
- Consume OCR job quota once per provider submission.
- Consume OCR page quota based on extracted/known page count deltas.
- Refund quota through ledger entries when a reserved/consumed operation fails
  and the existing flow calls for a refund.
- Never update usage totals directly; use append-only `quota_ledger` rows.

Limits are enforced in `web/src/lib/auth.ts` and constants live in
`web/src/lib/quota-limits.ts`:

- upload quota max: 10GB
- OCR page quota max: 2,000 pages per PaddleOCR daily limit

## Provider And Storage Secrets

Required secrets:

- `AUTH_BOOTSTRAP_TOKEN`
- `PADDLEOCR_API_TOKEN`

R2 is accessed through the `AUDIT_BUCKET` binding in production. If S3
compatibility variables are used in tests or fallback paths, treat access key ID,
secret access key, endpoint signatures, and presigned URLs as sensitive.

Do not put secrets in source, `.trellis/spec`, screenshots, `NEXT_PUBLIC_*`
variables, or user-visible error payloads.

## Error Responses

Security-sensitive failures should be specific enough for the legitimate user to
act, but not leak secrets.

Expected examples:

- invalid session: `401 UNAUTHENTICATED`
- non-admin: `403 ADMIN_REQUIRED`
- invalid login: `401 INVALID_CREDENTIALS`
- missing bootstrap secret: `503 BOOTSTRAP_TOKEN_MISSING`
- quota exhausted: `402 QUOTA_EXHAUSTED`
- invalid PaddleOCR provider token: stable server-side error message without the
  token value

## Tests To Add For Security Changes

- password hashing and verification
- session token hashing and lookup
- bootstrap first-admin guard
- admin-only user creation/update
- job ownership checks
- quota ledger reserve/consume/refund math
- above-limit quota rejection
- PaddleOCR `401` mapping

## Do Not Use

- Do not add Better Auth or OAuth flows without a migration task.
- Do not store raw tokens in D1.
- Do not allow query-string auth tokens.
- Do not expose object keys or provider IDs as proof of authorization.
