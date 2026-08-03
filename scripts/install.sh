#!/usr/bin/env bash
# Install the ubctl CLI from GitHub Releases.
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
dest="$tmp/$asset"

echo "ubctl: installing $asset ($VERSION)…"

# --- download and verify -----------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  base_url="https://github.com/$REPO/releases/latest/download"
else
  base_url="https://github.com/$REPO/releases/download/$VERSION"
fi

curl -fsSL "$base_url/$asset" -o "$dest"
curl -fsSL "$base_url/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected="$(grep "  $asset\$" "$tmp/SHA256SUMS")"
[ -n "$expected" ] || { echo "ubctl: checksum for $asset not found" >&2; exit 1; }
(cd "$tmp" && printf '%s\n' "$expected" | shasum -a 256 -c -)

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
