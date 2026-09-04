# Provider activation — free staging

## Unifonic

The API includes a direct Unifonic OTP adapter. Staging activation requires an AppSid and an approved Sender ID. Saudi mobile numbers are converted from the normalized local form (`05xxxxxxxx`) to the international form expected by the provider (`9665xxxxxxxx`). The OTP message is Arabic and states a five-minute validity period.

Configure the AppSid and Sender ID only in Render's protected runtime configuration. Do not commit them to Git or place them in public frontend variables.

Acceptance:

- send one OTP to an approved Saudi staging number
- verify the OTP is received within its validity period
- verify failed provider responses do not expose the AppSid in logs or API responses

## Resend

The API includes a direct Resend transactional-email adapter for password resets. Requests use a SHA-256-derived idempotency key so the reset token is not exposed in that header. The one-time reset token is placed in the URL fragment instead of the query string.

Use a verified sender/domain and a sending-only API key. Configure the key and sender address only in Render's protected runtime configuration.

Acceptance:

- deliver one password-reset email to a staging account
- consume the reset token once successfully
- verify replay is rejected
- verify the client clears the fragment after processing

## Selected staging defaults

`render.yaml` selects:

- `OTP_PROVIDER=unifonic`
- `EMAIL_PROVIDER=resend`

Local development may still use `log`. Webhook adapters remain available as a fallback integration option but are no longer the selected free-staging path.
