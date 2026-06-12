#!/usr/bin/env bash
# Install the ubctl CLI from GitHub Releases.
#
# The repo is private, so downloading release assets needs authentication:
#   - easiest: have the GitHub CLI installed and logged in (`gh auth login`), or
#   - export GITHUB_TOKEN with a token that can read unbroker-app/ubctl.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/unbroker-app/ubctl/main/scripts/install.sh | bash
#   VERSION=v0.2.0 INSTALL_DIR=~/.local/bin bash install.sh
set -euo pipefail

REPO="unbroker-app/ubctl"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# --- detect platform ---------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "ubctl: unsupported OS '$os' (Linux and macOS only)" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) echo "ubctl: unsupported architecture '$arch'" >&2; exit 1 ;;
esac
asset="ubctl-${os}-${arch}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
dest="$tmp/ubctl"

echo "ubctl: installing $asset ($VERSION)…"

# --- download ----------------------------------------------------------------
if command -v gh >/dev/null 2>&1; then
  args=(release download)
  [ "$VERSION" != "latest" ] && args+=("$VERSION")
  gh "${args[@]}" --repo "$REPO" --pattern "$asset" --output "$dest" --clobber
else
  : "${GITHUB_TOKEN:?gh CLI not found — set GITHUB_TOKEN to a token that can read $REPO}"
  api="https://api.github.com/repos/$REPO/releases"
  if [ "$VERSION" = "latest" ]; then
    api="$api/latest"
  else
    api="$api/tags/$VERSION"
  fi
  asset_id="$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" "$api" \
    | grep -B3 "\"name\": \"$asset\"" | grep '"id":' | head -1 \
    | tr -dc '0-9')"
  [ -n "$asset_id" ] || { echo "ubctl: asset $asset not found in $VERSION" >&2; exit 1; }
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/octet-stream" \
    "https://api.github.com/repos/$REPO/releases/assets/$asset_id" -o "$dest"
fi

chmod +x "$dest"

# --- place it on PATH --------------------------------------------------------
if [ -w "$INSTALL_DIR" ]; then
  mv "$dest" "$INSTALL_DIR/ubctl"
else
  echo "ubctl: $INSTALL_DIR is not writable — installing with sudo"
  sudo mv "$dest" "$INSTALL_DIR/ubctl"
fi

echo "ubctl: installed to $INSTALL_DIR/ubctl"
"$INSTALL_DIR/ubctl" --version
