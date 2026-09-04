# npm lockfile provenance

The first `package-lock.json` for Thiqah v1 was generated on GitHub-hosted Ubuntu with Node.js 24 from the pinned `package.json` using:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The one-time generation workflow completed successfully before committing the lockfile and removed itself in the same commit.

Generation workflow run: `33827611796`.

No lifecycle scripts were executed during lockfile generation or verification.
