# Thiqah web staging UI

Static, mobile-first frontend for the Phase 2 API contract.

## Local preview

```bash
python -m http.server 4173 -d apps/web
```

The default API base is the same origin. For a separate staging API, replace the
`api-base` meta value during the deployment build and add the exact frontend
origin to `PUBLIC_APP_ORIGINS` on the API service.

## Vercel

Set the Vercel project Root Directory to `apps/web`. No build command is
required. Do not promote the staging UI until `/v1/settings`, OTP delivery,
order creation, and opaque-token tracking pass end-to-end.
