# Thiqah v1 — Backend & Security Production Audit

Date: 2026-09-04

## Executive decision

**Current deployment is NOT production-ready and must not be wrapped for Android/iOS yet.**

The highest-risk finding is not visual or mobile: it is persistence. Runtime evidence shows first-admin bootstrap occurring more than once on the same Vercel production deployment. Until the original server code proves a durable shared database is used, treat the current persistence layer as ephemeral/non-shared and unsafe for real users.

## P0 — release blockers

### P0-01 — Persistence appears instance-local / non-shared

**Evidence:** identical first-admin bootstrap message appeared twice on separate requests to the same production deployment, using username `admin` and `ADMIN_PASSWORD` bootstrap configuration.

**Risk:** accounts/orders/settings/invoices/media can diverge or disappear between instances/redeploys.

**Action:** replace persistence with a real durable PostgreSQL database and private object storage before any real user data is accepted.

### P0-02 — Preview is publicly indexable

`/api/settings` reports `previewMode: true`, while the root has no `noindex` and robots allows crawling. Sitemap entries point to a deployment-specific Vercel hostname.

**Action:** Preview must return `X-Robots-Tag: noindex, nofollow`; Production must use the final custom domain and absolute canonical/hreflang/sitemap URLs.

### P0-03 — No source-of-truth repository

The Vercel project is not Git-linked and no Thiqah repository exists in the connected GitHub account.

**Action:** create a dedicated private repository `EslamElshikh-dev/thiqah-maintenance`; import original source if recoverable; otherwise rebuild server code cleanly from the verified API contract and recovered public clients. Never use unrelated repositories as a substitute.

### P0-04 — Saudi personal data currently processed by US-region compute

Current Vercel compute is `iad1` (Washington, D.C.). The product handles Saudi phone numbers, exact geolocation, household images and service details.

**Action:** treat international transfer/processing as a formal privacy/compliance decision. Preferred v1 data plane: Dammam (`me-central2`) for API, PostgreSQL and object storage, with data-flow/vendor documentation.

### P0-05 — Customer identity is not visibly verified

Registration accepts a Saudi phone and optional email with password, but no OTP/email verification is visible in the recovered client.

**Action:** verify phone ownership before using the phone as an identity/tracking factor. Email recovery must be verified before it becomes a recovery channel.

### P0-06 — Authenticated customer order ownership is ambiguous

The customer client pre-fills account name/phone but still submits editable values to generic `POST /api/orders`.

**Action:** for authenticated users, derive `customer_id` only from the server session. Never accept owner/customer identity from the body. Use a separate optional `contact_phone` for visit coordination.

### P0-07 — Public tracking uses predictable order IDs

Public IDs follow `ORD-YYYY-######` and are combined with phone as a lookup secret.

**Action:** keep human order numbers for support, but issue a high-entropy opaque tracking token. Hash it in DB and rate-limit tracking attempts.

### P0-08 — Admin has no visible MFA and bootstrap uses shared `admin`

**Action:** one account per administrator; mandatory TOTP/WebAuthn MFA; remove recurring runtime bootstrap; create the first admin via one-time migration/invitation; recovery changes require step-up authentication.

## P1 — high priority

### P1-01 — Base64 image uploads through JSON

Public/customer/technician flows resize images and encode them as Base64 inside API JSON. This increases payload ~33%, memory pressure and timeout/size risk.

**Fix:** request signed upload, upload directly to private object storage, finalize media metadata after MIME/size/hash checks. Server should never accept arbitrary object keys owned by another order.

### P1-02 — Session/CSRF properties not verifiable

Clients use browser sessions implicitly, but the original cookie construction is unavailable.

**Must verify:** `Secure`, `HttpOnly`, `SameSite=Lax/Strict`, expiration, login rotation, logout revocation, password-reset revocation, Origin checking for mutating browser requests, and no session ID in localStorage.

### P1-03 — Password-reset token in URL query

The reset page accepts `?token=...` and verifies it via GET.

**Fix:** high-entropy one-time token, DB stores only a hash, short TTL, one use, revoke sessions after reset. Exchange query token into a short-lived HttpOnly reset session then remove it from browser URL/history.

### P1-04 — Rate limiting not proven

Privacy text claims login-attempt controls, but implementation is not visible.

**Fix:** implement endpoint-specific limits for login, signup, OTP, reset, tracking, deletion request and order creation. Add account/device risk controls; do not rely only on IP.

### P1-05 — CSP still allows inline scripts/styles

Security headers are otherwise strong, but CSP includes `unsafe-inline` and third-party CDN hosts.

**Fix:** move inline scripts into versioned local files; self-host Leaflet/Chart.js or pin with integrity; use nonce/hash CSP; deploy report-only first.

### P1-06 — Server-side state machine must be authoritative

Technician client computes the next status, but client logic is not authorization.

**Fix:** server transition matrix by role and current state. Every transition creates immutable status event.

### P1-07 — Admin destructive actions need stronger domain rules

Technician DELETE is available in the UI even when historical work may exist.

**Fix:** soft-disable accounts with history; hard delete only records with no dependencies and via privileged audited workflow.

### P1-08 — Money/invoice model needs fixed precision and compliance boundary

Client sends JavaScript numeric `qty`/`unitPrice`. Current invoice UI is an operational invoice feature, not evidence of ZATCA-ready e-invoicing.

**Fix:** validate server-side; store integer halalas or PostgreSQL numeric fixed precision. If issuing tax invoices, implement the applicable ZATCA e-invoicing requirements separately.

## P2 — medium

- Modal/drawer focus is restored but no complete focus trap is visible.
- Public image-count UI can falsely show the max-image warning because the post-addition check double-counts selected files.
- Order/image/date/phone logic is duplicated between public and customer clients.
- Admin list views do not visibly paginate; add cursor pagination.
- Service worker is cached for seven days; use revalidation-friendly headers so emergency fixes propagate quickly.
- Decorative five-star visuals in “service standards” can look like ratings; use neutral trust/process icons until real reviews exist.
- Marketing says “prices clear before execution,” but recovered product has no complete quote → customer approval workflow. Remove claim until implemented.

## Positive controls already observed

- HSTS, nosniff, DENY framing, restrictive referrer policy, COOP/CORP and Permissions-Policy are present.
- Unauthenticated admin/customer/technician API checks return 401.
- Protected application pages redirect unauthenticated users to login.
- Dynamic client data is escaped/textContent in most high-risk rendering paths.
- Service worker excludes `/api`, `/uploads` and protected/auth pages from offline caching.
- Account deletion UX exists both inside the customer account and as an external support request path.
- Technician UI is designed around assigned orders rather than a global order browser.

## Product gaps before v1

Implement this authoritative lifecycle:

`new → triage → quoted → customer_approved → assigned → technician_accepted → on_the_way → in_progress → completed`

with explicit `cancelled` paths and optional `awaiting_customer_confirmation`.

Add:
- quote + quote items
- customer approval record
- assignment acceptance/rejection
- invoice + payment
- warranty record
- notification outbox (SMS/WhatsApp/push)
- immutable audit log
- SLA timestamps
- backup/PITR and restore test
- customer/property history

## Production acceptance criteria

Thiqah v1 can move to mobile packaging only when:

1. Durable shared DB/object storage is live.
2. Preview and Production are isolated.
3. Source is in private GitHub with protected main and migrations.
4. Phone verification and admin MFA are live.
5. BOLA/IDOR tests pass for customer/tech/admin.
6. Direct object uploads replace Base64 JSON.
7. Rate limits and reset-token controls pass abuse tests.
8. Production legal/support/business identity is complete.
9. Backup + restore drill succeeds.
10. Monitoring/alerts are live.
11. Quote/approval/service-completion business flow is coherent.
12. No P0/P1 security findings remain open.
