# Admin User Management Dialog

## Goal

Move administrator user management out of the always-visible sidebar and into an admin-only dialog opened from a compact command button. The change should keep the existing admin CRUD-like behavior, make quota configuration easier to read, and preserve the core audit workflow layout.

## What I Already Know

- The current admin user management UI lives in `web/src/components/audit/admin-user-panel.tsx`.
- `AdminUserPanel` already owns user list loading, create, update, enable, and disable behavior through same-origin admin APIs.
- `AuditCommandCenter` currently mounts `AdminUserPanel` in the left sidebar under an "管理员" card.
- Existing backend admin routes use first-party cookie auth and `requireAdmin`; no backend change is needed for moving the UI into a dialog.
- Existing "delete-like" behavior is enable/disable. Hard deletion is intentionally out of scope for this UI-only task.

## Requirements

- Show a compact "用户管理" entry only for admins.
- Place the entry in the top command area so it does not consume sidebar height.
- Open a dialog containing user management controls.
- Preserve current operations: list users, create users, edit names/roles/status/quotas, save changes, enable/disable users.
- Preserve self-disable protection.
- Make quota configuration readable without relying on a narrow sidebar layout.
- Avoid unnecessary admin user loading before the dialog is opened.
- Keep normal upload, OCR, history, and result flows unchanged.

## Acceptance Criteria

- [x] Admin users see a "用户管理" button in the command toolbar.
- [x] Non-admin users do not see the user management entry.
- [x] Clicking the button opens a titled dialog with user management controls.
- [x] User creation still works through the existing admin API.
- [x] User edits and enable/disable actions still work through the existing admin API.
- [x] The dialog has constrained height and internal scrolling on small screens.
- [x] The sidebar no longer permanently renders the full admin user panel.
- [x] No backend auth, quota, or database contract changes are introduced.

## Definition Of Done

- Frontend code follows project component, auth, hook, and type-safety guidelines.
- Relevant quality checks pass from `web/`: tests, lint, build, and Cloudflare build where feasible.
- Trellis task captures the decision and implementation scope.

## Out Of Scope

- Hard deleting users from the database.
- New backend admin routes.
- Password reset flows.
- Bulk user operations.
- Production deploy unless separately requested after verification.

## Technical Notes

- Use existing `Dialog` primitive from `web/src/components/ui/dialog.tsx`.
- The local `Dialog` primitive is controlled with `open` / `onOpenChange`; it does not currently export `DialogTrigger`.
- Keep admin UI under `web/src/components/audit/`.
- Use `lucide-react` icons for the command button and existing actions.
- Keep OCR/provider tokens and session secrets server-only; this task is UI-only.

## Verification

- `npm run test` passed from `web/`.
- `npm run lint` passed from `web/`.
- `npm run build` passed from `web/`.
- `npm run cf:build` passed from `web/`.
- `git diff --check` passed from the repository root.
