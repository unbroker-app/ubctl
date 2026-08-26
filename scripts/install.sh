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

# --- privilege helper --------------------------------------------------------
# Runs a command as root. When the script is piped (curl | bash) stdin is the
# script itself, so sudo must prompt on the real terminal instead of eating
# the pipe.
as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  elif ! command -v sudo >/dev/null 2>&1; then
    return 1
  elif sudo -n true 2>/dev/null; then
    sudo "$@"
  elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
    sudo "$@" </dev/tty
  else
    return 1
  fi
}

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

# --- install prerequisites (fresh VPS) ---------------------------------------
# curl downloads the release, ca-certificates enables TLS, coreutils provides
# sha256sum, and jq is what the docs use for scripting ubctl's --json output.
missing=()
command -v curl >/dev/null 2>&1 || missing+=(curl)
command -v jq >/dev/null 2>&1 || missing+=(jq)
if [ "$os" = "linux" ]; then
  command -v sha256sum >/dev/null 2>&1 || missing+=(coreutils)
  [ -d /etc/ssl/certs ] || missing+=(ca-certificates)
fi

if [ "${#missing[@]}" -gt 0 ]; then
  echo "ubctl: installing prerequisites: ${missing[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y -q "${missing[@]}"
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y -q "${missing[@]}"
  elif command -v apk >/dev/null 2>&1; then
    as_root apk add --no-cache "${missing[@]}"
  elif command -v pacman >/dev/null 2>&1; then
    as_root pacman -Sy --noconfirm --needed "${missing[@]}"
  elif command -v zypper >/dev/null 2>&1; then
    as_root zypper --non-interactive install "${missing[@]}"
  elif command -v brew >/dev/null 2>&1; then
    brew install "${missing[@]}"
  else
    echo "ubctl: no supported package manager found — install manually: ${missing[*]}" >&2
    exit 1
  fi
fi

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
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$tmp" && printf '%s\n' "$expected" | sha256sum -c -)
else
  (cd "$tmp" && printf '%s\n' "$expected" | shasum -a 256 -c -)
fi

chmod +x "$dest"

# --- place it on PATH --------------------------------------------------------
if [ -w "$INSTALL_DIR" ]; then
  mv "$dest" "$INSTALL_DIR/ubctl"
else
  echo "ubctl: $INSTALL_DIR is not writable — installing with sudo"
  if ! as_root mv "$dest" "$INSTALL_DIR/ubctl"; then
    echo "ubctl: could not escalate privileges (no sudo, or no terminal for its prompt)." >&2
    echo "       Re-run in an interactive shell, or install to a user directory:" >&2
    echo "         INSTALL_DIR=\$HOME/.local/bin bash install.sh" >&2
    exit 1
  fi
fi

echo "ubctl: installed to $INSTALL_DIR/ubctl"
"$INSTALL_DIR/ubctl" --version
