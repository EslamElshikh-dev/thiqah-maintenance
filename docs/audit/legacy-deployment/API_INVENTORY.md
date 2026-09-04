# API Inventory — Thiqah current deployment

This inventory is reconstructed from the live clients and black-box API probes. Authorization must be re-verified in server source and automated tests.

## Public / pre-authentication

| Method | Route | Purpose | v1 requirement |
|---|---|---|---|
| GET | `/api/settings` | Public branding/services/areas/settings | Return public-safe fields only; no internal flags in Production |
| POST | `/api/orders` | Create service request | Rate limit, idempotency, OTP/verified guest identity, strict validation, direct-upload media references only |
| GET | `/api/orders/:orderId?phone=...` | Public tracking | Replace phone+sequential-ID security with opaque tracking token; rate limit |
| POST | `/api/customer/register` | Customer signup | Verify phone OTP; optional email verification; anti-abuse |
| POST | `/api/customer/login` | Customer login | Rate limit, session rotation, generic errors |
| POST | `/api/tech/login` | Technician login | Rate limit; device/session controls |
| POST | `/api/admin/login` | Admin login | MFA mandatory; no shared `admin` credential |
| POST | `/api/auth/forgot-password` | Reset initiation | Generic response; anti-enumeration; rate limit |
| GET | `/api/auth/verify-reset-token?token=...` | Reset token check | Prefer token exchange then remove token from URL |
| POST | `/api/auth/reset-password` | Password reset | One-time hashed token, short TTL, revoke all sessions |
| POST | `/api/account-deletion-requests` | External deletion request | Rate limit; verify ownership before deletion |

## Customer session

| Method | Route | Purpose | Security invariant |
|---|---|---|---|
| GET | `/api/customer/me` | Current customer | Session identity only |
| POST | `/api/customer/logout` | Logout | Revoke server session |
| DELETE | `/api/customer/account` | Account deletion | Password/step-up; revoke sessions; delete media; anonymize legally retained records |
| GET | `/api/customer/orders` | Customer orders | `order.customer_id == session.customer_id` |
| GET | `/api/customer/orders/:orderId` | Order detail | Same ownership rule; no IDOR |

**Current client risk:** the authenticated customer order form still submits editable `name` and `phone` to the generic `/api/orders`. Production must derive ownership from the authenticated session, never from a phone/customer ID supplied by the client. A separate `contact_phone` may be allowed.

## Technician session

| Method | Route | Purpose | Security invariant |
|---|---|---|---|
| GET | `/api/tech/me` | Technician profile | Session technician only |
| GET | `/api/tech/orders` | Assigned orders | Assigned technician only |
| GET | `/api/tech/orders/:orderId` | Assigned order detail | Enforce assignment server-side |
| PATCH | `/api/tech/orders/:orderId` | Status transition | Enforce allowed role/state transition server-side |
| POST | `/api/tech/orders/:orderId/notes` | Field note | Assigned technician only; immutable audit metadata |
| POST | `/api/tech/orders/:orderId/images` | Before/after evidence | Signed object upload + assignment check; do not accept Base64 payloads |
| POST | `/api/tech/logout` | Logout | Revoke server session |

## Admin session

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/me` | Admin profile |
| GET | `/api/admin/dashboard-stats` | Dashboard KPI |
| GET | `/api/admin/orders` | Search/list orders |
| GET | `/api/admin/orders/:orderId` | Order detail |
| PATCH | `/api/admin/orders/:orderId` | Assign/update order |
| GET | `/api/admin/customers` | Customer list/search |
| GET | `/api/admin/customers/:phone/orders` | Customer order history |
| GET | `/api/admin/deletion-requests` | Account deletion queue |
| PATCH | `/api/admin/deletion-requests/:id` | Deletion workflow status |
| GET | `/api/admin/technicians` | Technician list |
| POST | `/api/admin/technicians` | Create technician |
| PATCH | `/api/admin/technicians/:id` | Edit technician |
| DELETE | `/api/admin/technicians/:id` | Delete technician — should become soft disable if history exists |
| GET | `/api/admin/technicians-map` | Last work locations |
| GET/POST | `/api/admin/services` | Services |
| PATCH/DELETE | `/api/admin/services/:id` | Service management |
| GET/POST | `/api/admin/areas` | Service areas |
| PATCH/DELETE | `/api/admin/areas/:id` | Area management |
| GET | `/api/admin/invoices` | Invoice list |
| POST | `/api/admin/invoices` | Create invoice |
| PATCH | `/api/admin/invoices/:invoiceId` | Invoice status |
| GET | `/api/admin/reports` | Operational/revenue report |
| GET | `/api/admin/settings` | Settings |
| PATCH | `/api/admin/settings` | Settings update |
| PATCH | `/api/admin/email` | Recovery email change — must require step-up auth/MFA |
| POST | `/api/admin/change-password` | Password change |
| POST | `/api/admin/logout` | Logout |

## Cross-cutting requirements for every mutating API

1. Authenticate on the server.
2. Authorize the exact object/transition on the server.
3. Validate schema, lengths, enum values, money values, MIME and ownership.
4. Reject unexpected fields where practical.
5. Require/validate `Origin` for browser cookie sessions.
6. Use Secure + HttpOnly + SameSite session cookies, rotation and revocation.
7. Rate-limit by endpoint/risk class; do not trust IP alone.
8. Idempotency keys on order, quote approval, invoice/payment creation.
9. Structured audit event for privileged actions without passwords/tokens/raw sensitive payloads.
10. No secrets or reset tokens in application logs.
