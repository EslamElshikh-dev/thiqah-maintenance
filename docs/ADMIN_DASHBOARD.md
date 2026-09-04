# Thiqah admin dashboard

## Routes

- `/admin`: real password + TOTP sign-in and live operational data.
- `/admin?demo=1`: sanitized visual review only; it never reads or writes customer data.

## Owner activation

The owner is bootstrapped once after the staging database migrations succeed.
Use `admin` as the username and `صالح` as the display name. Supply the approved
password, a verified owner email, and a TOTP secret only through the protected
bootstrap environment. Never commit or expose those values in frontend files.

Remove the one-time password and TOTP bootstrap values immediately after the
account is created. Deployed environments keep TOTP mandatory.

## Permission model

- `owner`: complete access, including employee access administration.
- `admin`: operations, quotes and technician administration.
- `operator`: customers, orders and assignments.
- `support`: read-only customer and order support.
- `finance`: dashboard, orders and quotes.
- `technician`: assigned jobs, status updates, work photos and notes.

Explicit grants override role defaults. Disabling an employee or technician
revokes all of that account's active sessions.
