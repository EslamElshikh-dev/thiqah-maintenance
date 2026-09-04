# Thiqah v1 Security Test Plan

A release fails if any P0/P1 test below fails.

## Authentication

- [ ] Admin login rotates session ID.
- [ ] Customer/tech login rotates session ID.
- [ ] Session cookie is Secure + HttpOnly + appropriate SameSite.
- [ ] Logout invalidates server session, not just browser cookie.
- [ ] Password change invalidates other sessions.
- [ ] Password reset invalidates all prior sessions.
- [ ] Admin MFA cannot be bypassed through reset/recovery path.
- [ ] Generic login/reset errors do not reveal account existence.
- [ ] OTP cannot be replayed and has short TTL/attempt cap.
- [ ] Unverified phone cannot become customer identity.

## BOLA / IDOR

Create Customer A/B and Technician A/B fixtures.

- [ ] A cannot GET B's order by changing order ID.
- [ ] A cannot create a request owned by B by changing `phone`, `customer_id`, email or any hidden field.
- [ ] Tech A cannot GET Tech B's assigned order.
- [ ] Tech A cannot add note/image/status to Tech B's order.
- [ ] Tech cannot select arbitrary next status not permitted by state machine.
- [ ] Customer cannot set `assignedTechnicianId`, price, status, invoice or warranty fields.
- [ ] Object-storage URL for B cannot be requested by A.
- [ ] Deleted/disabled technician sessions cannot continue accessing assigned orders.

## Admin/RBAC

- [ ] Non-admin session cannot call any `/admin/*` route.
- [ ] Admin permissions are explicit if multiple admin roles exist.
- [ ] Recovery email update requires step-up auth.
- [ ] Settings updates audit old/new safe values.
- [ ] Technician deletion with history is rejected or converted to disable.

## CSRF / browser session

- [ ] Cross-site POST with form encoding rejected.
- [ ] Cross-site JSON attempt cannot execute privileged mutation.
- [ ] Server validates Origin on cookie-authenticated mutating requests.
- [ ] CORS allowlist contains only production app origins.

## Rate limiting / abuse

- [ ] Admin login brute-force throttled.
- [ ] Customer/tech login throttled.
- [ ] OTP send and verify throttled by phone + IP/device/risk key.
- [ ] Reset initiation throttled.
- [ ] Public tracking enumeration throttled.
- [ ] Order creation throttled + idempotent.
- [ ] Account-deletion request spam throttled.
- [ ] Limits return consistent 429 and do not leak internal counters.

## Reset token

- [ ] Token >=128 bits cryptographic randomness.
- [ ] Only token hash stored.
- [ ] One-time use.
- [ ] Short expiry.
- [ ] Token removed from visible URL after exchange.
- [ ] Token absent from logs/analytics/referrers.

## Uploads

- [ ] No Base64 image body accepted by v1 API.
- [ ] Signed upload URL cannot target arbitrary object key.
- [ ] MIME checked by magic bytes.
- [ ] Max file bytes/dimensions enforced server-side.
- [ ] SVG/HTML/script uploads rejected for photo slots.
- [ ] Cross-order object reference rejected.
- [ ] Private media requires authorization or short-lived signed download.
- [ ] Account deletion removes eligible media.

## Persistence / resilience

- [ ] Data written through instance A is immediately visible through instance B.
- [ ] Cold start does not recreate bootstrap admin.
- [ ] Redeploy does not lose users/orders/settings.
- [ ] DB transaction protects order + initial status event.
- [ ] Idempotency test produces exactly one order/payment.
- [ ] Daily backup exists.
- [ ] Restore drill to isolated database succeeds and is timed.

## Logs/privacy

- [ ] Passwords never logged.
- [ ] OTP/reset/session tokens never logged.
- [ ] Raw household images not logged.
- [ ] Exact location omitted/masked in ordinary request logs.
- [ ] Audit log records actor/action/object without sensitive bodies.
