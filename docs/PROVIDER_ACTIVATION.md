# Provider activation — staging

## Unifonic

The API includes a direct Unifonic OTP adapter. Staging activation requires an AppSid and an approved Sender ID. Saudi mobile numbers are converted from the normalized local form (`05xxxxxxxx`) to Unifonic's international form (`9665xxxxxxxx`). The OTP message is Arabic and states a five-minute validity period.

Keep the AppSid outside GitHub. Store it as a Regional Secret Manager secret version when the Dammam data plane is connected.

## Resend

The API includes a direct Resend transactional-email adapter for password resets. Requests use a hashed idempotency key so the reset token is not exposed in the idempotency header. The reset URL places the one-time token in the URL fragment rather than the query string.

Use a verified sender address and a sending-only API key. Keep the API key outside GitHub and store it as a Regional Secret Manager secret version when the Dammam data plane is connected.

## Current staging switch

Until the GCP/CNTXT secret-loading path is connected, the existing Webhook adapters remain the deployment default. Do not inject provider credentials into GitHub variables to bypass this gate.
