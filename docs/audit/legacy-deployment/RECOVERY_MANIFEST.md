# Recovery Manifest

## Evidence classification

### VERIFIED from Vercel deployment/runtime

- Build retrieved **45 deployment files**.
- Deployment is a Node.js Lambda deployment in `iad1`.
- `previewMode` is enabled in the public settings API.
- Public root is indexable while preview mode is enabled.
- Admin, technician, and customer protected API probes return `401` without a valid session.
- Protected HTML routes redirect unauthenticated users to their login surfaces.
- The runtime logged automatic creation of the first `admin` account from `ADMIN_PASSWORD` more than once on the same deployment.
- No dedicated Thiqah Supabase project exists in the connected Supabase account.

### STRONG INFERENCE requiring original server source for final proof

The repeated first-admin bootstrap on separate Lambda invocations strongly indicates that application state is kept in instance-local/non-shared storage, or another persistence mechanism that is not durable/shared across instances. This must be treated as a P0 blocker until disproven by source inspection.

If users/orders/invoices/settings are persisted to local filesystem or instance memory, data can diverge across Lambda instances and disappear on cold starts or redeploys.

### PUBLIC/CLIENT FILES inspected through the authorized Vercel endpoint

- `/` (`index.html` response)
- `/admin-login.html`
- `/customer-login.html`
- `/tech-login.html`
- `/reset-password.html`
- `/privacy.html`
- `/terms.html`
- `/support.html`
- `/manifest.webmanifest`
- `/sw.js`
- `/robots.txt`
- `/sitemap.xml`
- `/js/config.js`
- `/js/order-status.js`
- `/js/main.js`
- `/js/orders.js`
- `/js/customer.js`
- `/js/tech.js`
- `/js/admin.js`
- `/js/maps/config.js`
- `/js/maps/provider-leaflet.js`
- `/js/maps/index.js`
- `/js/maps/geo-links.js`
- `/css/style.css` (headers/behavior inspected; full source not materialized locally)
- `/css/auth.css` (referenced by auth pages)

### NOT retrievable from the current connector

- Original server handler source
- Original package.json source (public request correctly returns 404)
- Lockfile/dependency graph
- Exact database/storage adapter implementation
- Exact password hashing implementation
- Session cookie construction and session persistence code
- Server-side CSRF/Origin validation implementation
- Rate-limit implementation
- Reset-token generation/hash/TTL implementation
- Full list/names of all 45 original deployment input files
- Any local database/data files packaged into the original deployment

A claim of “all 45 source files audited” would therefore be inaccurate until the original server source is recovered or supplied.
