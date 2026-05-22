# System Constraint Design Guide

> **Severity**: P1 - Data corruption / integrity violations

## Problem

When implementing a module that simulates an existing system (e.g., file system, version control, key-value store), bugs emerge because the simulation doesn't enforce the original system's constraints:

1. **Duplicate entries** - Same key/path created multiple times
2. **Non-deterministic reads** - Same query returns different results
3. **Sequence violations** - Version numbers skip or duplicate

## Example Scenario

Building a virtual file system on top of a database:

| File System Constraint     | Simulation Status | Bug                                    |
| -------------------------- | ----------------- | -------------------------------------- |
| Path uniqueness            | Not enforced      | Multiple files at same path            |
| Directory listing order    | Not specified     | `ls` returns random order              |
| Sequential version numbers | Cached value used | Version conflicts on concurrent writes |

## Initial Attempts (All Failed)

### 1. Trust the database will handle it

```typescript
// Just insert, assume no duplicates
await db.insert(items).values({ path: "/foo/bar", name: "file.txt" });
```

**Why it fails**: Relational databases don't automatically prevent duplicate combinations unless you add unique constraints.

### 2. Use findFirst without ordering

```typescript
const item = await db.query.items.findFirst({
  where: eq(items.path, "/foo/bar"),
});
```

**Why it fails**: When duplicates exist, `findFirst` returns whichever row the database finds first - non-deterministic.

### 3. Cache mutable values for performance

```typescript
// Get cached version number
const currentVersion = entity.cachedVersion;
const newVersion = currentVersion + 1;
await db.insert(versions).values({ version: newVersion });
```

**Why it fails**: Cached value may be stale. Concurrent writes read same cache, both try to write same version.

## Root Cause

**The fundamental mistake**: Treating system simulation as ordinary CRUD operations without translating system constraints into code constraints.

A real file system enforces:

```
Constraint 1: Uniqueness - Only one file can exist at a path
Constraint 2: Determinism - Same operation always returns same result
Constraint 3: Atomicity - Operations succeed completely or fail completely
Constraint 4: Ordering - Sequential operations produce sequential results
```

Database tables don't enforce these by default.

## Solution

### 1. List All Constraints Before Implementation

Create a constraint document before writing code:

```markdown
## System: Virtual File System

| Constraint               | Description                          | Enforcement Strategy                 |
| ------------------------ | ------------------------------------ | ------------------------------------ |
| Path uniqueness          | One entry per (parent_id, name) pair | DB unique index + check before write |
| Deterministic resolution | Same path always resolves to same ID | orderBy in all queries               |
| Version continuity       | Versions are sequential integers     | Get max from source table, not cache |
| Atomic operations        | Rename is atomic move + update       | Database transaction                 |
```

### 2. Uniqueness: Check Before Write

```typescript
// Before creating, check for existing
async function findExisting(
  db: Database,
  parentId: string,
  name: string,
): Promise<string | null> {
  const existing = await db.query.items.findFirst({
    where: and(
      eq(items.parentId, parentId),
      eq(items.name, name),
      isNull(items.deletedAt),
    ),
    columns: { id: true },
  });
  return existing?.id ?? null;
}

async function createItem(db: Database, parentId: string, name: string) {
  const existingId = await findExisting(db, parentId, name);
  if (existingId) {
    return { id: existingId, created: false }; // Return existing
  }
  // Create new only if not exists
  const newItem = await db.insert(items).values({ parentId, name });
  return { id: newItem.id, created: true };
}
```

### 3. Determinism: Always Specify Order

```typescript
// WRONG: Non-deterministic
const item = await db.query.items.findFirst({
  where: eq(items.path, targetPath),
});

// CORRECT: Deterministic - always returns oldest
const item = await db.query.items.findFirst({
  where: eq(items.path, targetPath),
  orderBy: (t, { asc }) => [asc(t.createdAt)],
});
```

**Rule**: Every `findFirst` must have an `orderBy`. Even if "there should only be one row", code defensively.

### 4. Sequence: Get from Source of Truth

```typescript
// WRONG: Using potentially stale cached value
const newVersion = entity.cachedVersion + 1;

// CORRECT: Query actual maximum from source table
async function getNextVersion(db: Database, entityId: string): Promise<number> {
  const latest = await db.query.versions.findFirst({
    where: eq(versions.entityId, entityId),
    orderBy: (v, { desc }) => [desc(v.version)],
    columns: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

const newVersion = await getNextVersion(db, entityId);
```

### 5. Add Database-Level Constraints

Belt and suspenders - add DB constraints as final safety net:

```sql
-- Unique constraint on path components
CREATE UNIQUE INDEX idx_items_unique_path
ON items (parent_id, name)
WHERE deleted_at IS NULL;

-- Check constraint on version
ALTER TABLE versions
ADD CONSTRAINT versions_positive CHECK (version > 0);
```

## Constraint Translation Template

Use this template when designing any system simulation:

```markdown
## Constraint Translation: [System Name]

### Original System Constraints

1. [Constraint from real system]
2. [Another constraint]

### Database Enforcement

| Constraint | Table(s) | Strategy | Index/Trigger |
| ---------- | -------- | -------- | ------------- |
| ...        | ...      | ...      | ...           |

### Application Enforcement

| Constraint | Function | Validation |
| ---------- | -------- | ---------- |
| ...        | ...      | ...        |

### Edge Cases

- What happens on concurrent writes?
- What happens if constraint violated?
- How do we detect and repair violations?
```

## Key Insights

### 1. Simulating a System Requires Understanding Its Invariants

Before implementing, ask: "What guarantees does the original system provide?"

- File systems: path uniqueness, atomic rename
- Version control: linear or DAG history, immutable commits
- Key-value stores: single value per key, consistent reads

### 2. Databases are Generic, Systems are Specific

A database provides generic storage. Your code must add the specific invariants of the system you're simulating.

### 3. "Should Only Be One" is Not "Will Only Be One"

Code defensively. If your data model allows duplicates, duplicates will eventually occur:

- Race conditions
- Retry logic
- Bug in validation
- Manual database edits

### 4. Boundary Checks are Standard for Write Operations

Every write operation should:

1. Check existence before create
2. Check target state before move/update
3. Check current version before versioned update
4. Use transactions for multi-step operations

## Prevention Checklist

- [ ] Document all constraints of the simulated system
- [ ] Translate each constraint to code enforcement
- [ ] Add database-level constraints where possible
- [ ] Use `orderBy` on all `findFirst` queries
- [ ] Query source of truth for sequential values
- [ ] Add integration tests for constraint violations
- [ ] Document edge cases and recovery procedures

## Scenario: Local Runtime to Cloud Runtime Migration

### 1. Scope / Trigger

- Trigger: a feature or deployment request moves a working local service into a cloud/serverless/container runtime.
- Applies when the current implementation uses machine-local OS APIs, local filesystem state, embedded SQLite, long-running subprocesses, or local tunnels.

### 2. Signatures

- Runtime mode selector: `AUDIT_RUNTIME_MODE=local-python | paddleocr | provider-ocr | container-ocr | remote-macos`
- Local fallback endpoint: `PYTHON_AUDIT_BASE_URL=<http-url>`
- Object storage contract:
  - `jobs/{jobId}/input.pdf`
  - `jobs/{jobId}/manifest.json`
  - `jobs/{jobId}/ocr.txt`
  - `jobs/{jobId}/result.json`
  - `jobs/{jobId}/matches.csv`
- OCR adapter contract:
  - `startOcrJob(jobId, inputObjectKey) -> providerJobId`
  - `getOcrJobStatus(providerJobId) -> queued | running | complete | failed`
  - `collectOcrOutput(providerJobId) -> normalized page text + metadata`
- PaddleOCR boundary endpoints:
  - `POST /api/audit/paddleocr/jobs` with `{ "fileUrl": "<http-url>" }` -> `{ "providerJobId": "<jobId>" }`
  - `GET /api/audit/paddleocr/jobs/{jobId}/status` -> `{ "snapshot": { providerState, status, message, totalPages, extractedPages, jsonUrl } }`
- Cloud object upload boundary endpoints:
  - `POST /api/audit/cloud-uploads` with `{ "filename": "...pdf", "size": number, "contentType": "application/pdf" }` -> signed PUT URL and `objectKey`
  - `POST /api/audit/cloud-uploads/paddleocr` with `{ "objectKey": "jobs/<jobId>/input.pdf" }` -> signed GET URL submission to PaddleOCR and `providerJobId`
- S3-compatible object storage config:
  - `AUDIT_OBJECT_STORE_DRIVER=r2-s3`
  - `AUDIT_OBJECT_STORE_ENDPOINT`
  - `AUDIT_OBJECT_BUCKET`
  - `AUDIT_OBJECT_ACCESS_KEY_ID`
  - `AUDIT_OBJECT_SECRET_ACCESS_KEY`
  - `AUDIT_OBJECT_PREFIX`
- PaddleOCR provider secrets/config:
  - `PADDLEOCR_API_BASE_URL`
  - `PADDLEOCR_API_TOKEN`
  - `PADDLEOCR_MODEL`
  - `PADDLEOCR_POLL_INTERVAL_MS`

### 3. Contracts

- Do not deploy macOS-only code (`PDFKit`, `Vision`, `AppKit`) to Linux/serverless runtimes.
- Do not rely on local filesystem upload staging in immutable or multi-instance runtimes.
- Do not rely on local SQLite for shared cloud history unless the deployment target provides a persistent single-node disk and explicit backup policy.
- Preserve artifact names across runtimes so UI/download endpoints remain stable.
- Keep provider tokens in the deployment secret store; never commit bearer tokens to docs, examples, or task files.
- PaddleOCR URL-mode job submission must reject non-HTTP(S) `fileUrl` values.
- Cloud upload must reject non-PDF file names, files over the configured size limit, and object keys outside the configured prefix.
- PaddleOCR `done` results must be normalized from JSONL `result.layoutParsingResults[].markdown.text` before reuse by existing expiry extraction.
- Keep local mode working until cloud OCR parity is verified with real PDFs.

### 4. Validation & Error Matrix

- macOS-only import in target cloud runtime -> block deployment plan; choose provider OCR, Linux OCR port, or remote macOS host.
- upload path buffers whole PDF in memory -> reject for cloud mode; use object storage streaming or multipart upload.
- history DB is process-local or disk-local in a multi-instance runtime -> reject; use cloud DB.
- OCR job runs synchronously inside request handler -> reject for large PDFs; use async job lifecycle.
- DNS cutover before parity tests -> reject; keep existing route as rollback.
- real provider token appears in committed files -> rotate the token and replace with an environment-variable placeholder.
- PaddleOCR `fileUrl` is `file://` or another local path -> reject; upload to object storage and pass a signed HTTP(S) URL.
- PaddleOCR state is outside `pending|running|done|failed` -> fail closed and surface provider drift.
- object key uses `..`, an absolute path, a backslash, or a different prefix -> reject before signing.

### 5. Good/Base/Bad Cases

- Good: Cloud front door stores PDFs in object storage, records jobs in cloud DB, starts async OCR, and updates status when artifacts are ready.
- Base: Local Python/Swift service remains the fallback profile behind `PYTHON_AUDIT_BASE_URL`.
- Bad: Deploy the Next.js app to serverless while keeping `better-sqlite3`, local upload chunk files, and a macOS Swift subprocess assumption.

### 6. Tests Required

- Unit tests for provider-neutral OCR output normalization.
- Unit tests for PaddleOCR config parsing, URL request building, state mapping, JSONL markdown parsing, and `ocr.txt` conversion.
- Unit tests for object storage config parsing, signed PUT/GET URL generation, object key safety, and upload metadata validation.
- Storage tests asserting the exact artifact keys and cleanup behavior.
- Database tests asserting deterministic job history ordering and status transitions.
- Parity test against at least one real nested-outline PDF before DNS cutover.
- Build check for deployment target warnings about traced local filesystem access.

### 7. Wrong vs Correct

#### Wrong

```text
Move the web app to a cloud serverless target and keep local upload chunks,
local SQLite, and the Swift PDFKit/Vision OCR helper unchanged.
```

#### Correct

```text
First split runtime state into object storage, cloud database, and an async OCR
adapter. Keep the local Swift path as a fallback until cloud OCR parity is
proved against real documents.
```

## References

- [Designing Data-Intensive Applications - Chapter 7: Transactions](https://dataintensive.net/)
- [POSIX File System Semantics](https://pubs.opengroup.org/onlinepubs/9699919799/)
