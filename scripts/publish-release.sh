#!/usr/bin/env bash
# Publish a new release of Whyspr desktop app.
#
# What it does:
#   1. Builds Mac + Windows installers
#   2. Computes SHA-256 hashes
#   3. Creates a GitHub release and uploads both files
#   4. Registers the version with the Whyspr backend (POST /api/admin/versions)
#
# Prerequisites:
#   - `gh` CLI installed and authenticated (`gh auth login`)
#   - GitHub repo set as origin remote
#   - Environment variables:
#       WHYSPR_API_URL    e.g. https://whyspr.ai  (or http://localhost:3000 for dev)
#       WHYSPR_ADMIN_COOKIE  Session cookie from your admin login (see below)
#
# To get the admin cookie:
#   1. Log in to your whyspr.ai with an email listed in ADMIN_EMAILS env var
#   2. Browser devtools → Application → Cookies → copy `whyspr_session` value
#   3. export WHYSPR_ADMIN_COOKIE="paste-here"
#
# Usage:
#   ./scripts/publish-release.sh 0.2.0 "Release notes here"

set -euo pipefail

VERSION="${1:-}"
RELEASE_NOTES="${2:-Bug fixes and improvements.}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [release-notes]"
  echo "Example: $0 0.2.0 'Added interview template'"
  exit 1
fi

API_URL="${WHYSPR_API_URL:-https://whyspr.ai}"
ADMIN_COOKIE="${WHYSPR_ADMIN_COOKIE:-}"

if [[ -z "$ADMIN_COOKIE" ]]; then
  echo "Error: WHYSPR_ADMIN_COOKIE not set. See script header for how to get it."
  exit 1
fi

# Verify gh CLI
if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install: brew install gh"
  exit 1
fi

echo "==> Building Mac and Windows installers (v$VERSION)..."
rm -rf dist
npm run build:mac
npm run build:win

MAC_DMG="$(ls dist/*.dmg | head -1)"
WIN_EXE="$(ls dist/*.exe | head -1)"

if [[ ! -f "$MAC_DMG" ]]; then
  echo "Error: Mac .dmg not found in dist/"
  exit 1
fi
if [[ ! -f "$WIN_EXE" ]]; then
  echo "Error: Windows .exe not found in dist/"
  exit 1
fi

echo "==> Computing SHA-256 hashes..."
MAC_SHA=$(shasum -a 256 "$MAC_DMG" | awk '{print $1}')
WIN_SHA=$(shasum -a 256 "$WIN_EXE" | awk '{print $1}')
MAC_SIZE=$(stat -f%z "$MAC_DMG" 2>/dev/null || stat -c%s "$MAC_DMG")
WIN_SIZE=$(stat -f%z "$WIN_EXE" 2>/dev/null || stat -c%s "$WIN_EXE")

echo "    Mac: $MAC_DMG ($MAC_SIZE bytes, sha $MAC_SHA)"
echo "    Win: $WIN_EXE ($WIN_SIZE bytes, sha $WIN_SHA)"

echo "==> Creating GitHub release v$VERSION..."
gh release create "v$VERSION" "$MAC_DMG" "$WIN_EXE" \
  --title "Whyspr v$VERSION" \
  --notes "$RELEASE_NOTES"

# Get the public URLs gh assigned
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
MAC_FILENAME=$(basename "$MAC_DMG")
WIN_FILENAME=$(basename "$WIN_EXE")
MAC_URL="https://github.com/$REPO/releases/download/v$VERSION/$MAC_FILENAME"
WIN_URL="https://github.com/$REPO/releases/download/v$VERSION/$WIN_FILENAME"

echo "==> Registering Mac version with backend..."
curl -fsS -X POST "$API_URL/api/admin/versions" \
  -H "content-type: application/json" \
  -H "cookie: whyspr_session=$ADMIN_COOKIE" \
  -d "{\"version\":\"$VERSION\",\"platform\":\"mac\",\"arch\":\"arm64\",\"downloadUrl\":\"$MAC_URL\",\"fileSize\":$MAC_SIZE,\"sha256\":\"$MAC_SHA\",\"releaseNotes\":\"$RELEASE_NOTES\"}" \
  && echo

echo "==> Registering Windows version with backend..."
curl -fsS -X POST "$API_URL/api/admin/versions" \
  -H "content-type: application/json" \
  -H "cookie: whyspr_session=$ADMIN_COOKIE" \
  -d "{\"version\":\"$VERSION\",\"platform\":\"win\",\"arch\":\"x64\",\"downloadUrl\":\"$WIN_URL\",\"fileSize\":$WIN_SIZE,\"sha256\":\"$WIN_SHA\",\"releaseNotes\":\"$RELEASE_NOTES\"}" \
  && echo

echo ""
echo "✓ Done! v$VERSION published."
echo "  Mac:     $MAC_URL"
echo "  Windows: $WIN_URL"
echo ""
echo "Users can now download from: $API_URL/dashboard/downloads"
