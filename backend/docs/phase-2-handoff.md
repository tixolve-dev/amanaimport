# Phase 2 Handoff — Admin Dashboard Contract

This document is the authoritative contract for the React admin dashboard
being built in Phase 2. Do not deviate without updating this file.

## Auth

- `POST /api/v1/auth/login` → returns `{ tokens: { accessToken, refreshToken } }`
- Store access token in memory; refresh in httpOnly-cookie-like secure storage (browser: sessionStorage or httpOnly cookie set by proxy).
- Every admin request must send `Authorization: Bearer <accessToken>`.
- `POST /api/v1/auth/refresh` on 401 to rotate the pair. If refresh fails, force logout.

## Common shapes

- Success: `{ success: true, message, data, meta? }`
- Error: `{ success: false, error: { code, message, details? }, requestId }`
- Pagination: `meta.pagination = { page, limit, total, totalPages }`

## Screens & Endpoints

| Screen | Endpoints |
|---|---|
| Login | `POST /auth/login` |
| Dashboard | `GET /admin/reports/summary` |
| Users | (search) — user list is via importer + order endpoints for now |
| Importers list | `GET /admin/importers?status=pending&q=` |
| Importer detail | `GET /admin/importers/:id` |
| Importer review | `PATCH /admin/importers/:id/review { action, notes }` |
| Requests | (read-only, `GET /admin/reports/requests`) |
| Orders list | `GET /admin/orders?status=&buyerId=&importerId=` |
| Order detail | `GET /admin/orders/:id` |
| Order transition | `POST /admin/orders/:id/transition { to, note }` |
| Order messages | `GET /admin/orders/:orderId/messages` |
| Payments list | `GET /admin/payments?status=submitted` |
| Payment review | `POST /admin/payments/:id/review { action: verify/reject/reverse/dispute, note, rejectionReason }` |
| Disputes list | `GET /admin/disputes?status=open` |
| Dispute detail | `GET /admin/disputes/:id` |
| Dispute resolve | `POST /admin/disputes/:id/resolve { outcome, notes, refundPromisedETB }` |
| Commission rules | `GET /admin/commission-rules` · `POST /admin/commission-rules` · `PATCH /admin/commission-rules/:id` · `DELETE /admin/commission-rules/:id` |
| Commission records | `GET /admin/commission-records?revenueState=` |
| Revenue | `GET /admin/revenue/summary` · `POST /admin/commission-records/:id/transition { to }` |
| Fraud reports | `GET /admin/fraud-reports` · `GET /admin/fraud-reports/:id` · `PATCH /admin/fraud-reports/:id { status, notes }` |
| Audit | `GET /admin/audit?actor=&action=&targetType=&targetId=` |
| Legal checklist | `GET /admin/legal-checklist` · `PATCH /admin/legal-checklist/:item { status, notes }` |

## Error codes the UI must handle gracefully

- `UNAUTHORIZED` / `TOKEN_EXPIRED` → refresh or force login
- `FORBIDDEN` / `ROLE_NOT_ALLOWED` → toast "Not allowed"
- `VALIDATION_ERROR` → render `details[]` inline on forms
- `INVALID_STATE_TRANSITION` / `INVALID_PAYMENT_STATE` / `INVALID_REVENUE_TRANSITION` → toast with message, do not retry
- `DUPLICATE_KEY` → surface `details.field`
- `NOT_FOUND` → show 404 screen

## Realtime (later)

Not required for Phase 2. Admin dashboard is poll-based. When needed, we
will expose a WebSocket or SSE endpoint; not part of Phase 2 scope.

## Security notes for admin UI

- Never persist access tokens in `localStorage`. Prefer memory + refresh via proxy.
- Never expose tokens in URLs.
- Every destructive action requires an explicit confirmation dialog.
- Every review / resolve action surfaces the audit-log consequence.