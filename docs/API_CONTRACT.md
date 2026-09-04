# Thiqah v1 API contract

Base prefix: `/v1`.

## Auth
- `POST /auth/customer/register/start` → issue phone OTP.
- `POST /auth/customer/register/verify` → create verified customer + session.
- `POST /auth/customer/login`.
- `POST /auth/technician/login`.
- `POST /auth/admin/login` → password stage only.
- `POST /auth/admin/mfa/verify` → TOTP stage + session.
- `POST /auth/logout`.
- `GET /auth/me`.

## Orders
- `POST /orders/guest/start` → validate order and OTP phone.
- `POST /orders/guest/verify` → create guest order; requires `Idempotency-Key`.
- `POST /orders` → authenticated customer create; requires `Idempotency-Key`.
- `GET /orders/track?orderNumber=&token=` → opaque tracking secret, never phone-as-password.
- `GET /customer/orders` → cursor pagination.
- `POST /orders/:id/transition` → server-side actor/state-machine enforcement.

## Quotes
- `POST /admin/orders/:id/quotes` → server calculates subtotal, VAT and total, then sends quote.
- `GET /customer/orders/:id/quotes`.
- `POST /customer/quotes/:id/approve` → ownership + expiry checks, immutable approval evidence.

## Media
- `POST /orders/:id/media/upload-intent` → short-lived signed regional upload.
- `PUT signed GCS URL` → bytes never traverse application API.
- `POST /orders/:id/media/complete` → stream the private object server-side; verify actual size, magic-byte MIME and SHA-256 before persisting the media record.
- `GET /orders/:id/media/:mediaId/read-url` → RBAC-checked, five-minute signed read URL; private bucket remains non-public.

## Administration
- `GET /admin/dashboard` → live customer/order/technician KPIs, seven-day trend and recent activity.
- `GET /admin/orders` → cursor pagination and optional status filter.
- `POST /admin/orders/:id/assign` → assignment and status transition in one DB transaction.
- `GET /admin/technicians`.
- `GET /admin/access` → employee/technician accounts and permission catalog; owner permission required.
- `POST|PATCH /admin/staff` → create or update employee access and revoke sessions on disable.
- `POST|PATCH /admin/technicians` → create or update technician access and revoke sessions on disable.

## Technician
- `GET /technician/orders` → active assignments only.
- `POST /technician/orders/:id/notes` → permission-gated note on an active assignment only.

## Privacy
- `DELETE /customer/me` → password step-up. Active jobs create a verified deletion request; otherwise PII is anonymized and media purge is queued.

## CSRF and sessions
Browser sessions use Secure HttpOnly cookies. Every mutating cookie-authenticated request requires `X-CSRF-Token`; mobile clients use opaque Bearer sessions kept in OS secure storage.
