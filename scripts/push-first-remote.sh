#!/usr/bin/env sh
set -eu
REMOTE_URL="${1:-}"
TARGET_BRANCH="${2:-$(git branch --show-current)}"
if [ -z "$REMOTE_URL" ]; then
  echo "usage: scripts/push-first-remote.sh git@github.com:EslamElshikh-dev/thiqah-maintenance.git [branch]" >&2
  exit 2
fi
if [ -z "$TARGET_BRANCH" ]; then
  echo "cannot determine branch; pass it explicitly" >&2
  exit 2
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo "origin already exists; refusing to overwrite it" >&2
  exit 3
fi
git remote add origin "$REMOTE_URL"
git push -u origin "$TARGET_BRANCH" --follow-tags
