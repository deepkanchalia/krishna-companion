#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Voice helper builds only on macOS." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Embed the privacy usage strings in this bare executable. The Electron app that
# launches it must also carry both keys; see docs/voice-helper.md.
swift_flags=()
stale_module_map="/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap"
current_module_map="/Library/Developer/CommandLineTools/usr/include/swift/bridging.modulemap"
if [[ -f "$stale_module_map" && -f "$current_module_map" ]]; then
  # Some mixed Command Line Tools installs retain both maps. Hide the obsolete
  # one from Swift without changing the installed developer tools.
  swift_flags=(-vfsoverlay scripts/swift-vfs-overlay.yaml)
fi

module_cache="${TMPDIR:-/tmp}/krishna-companion-swift-module-cache"
xcrun swiftc -O helpers/listen.swift \
  -o helpers/listen \
  -framework Speech \
  -framework AVFoundation \
  "${swift_flags[@]}" \
  -module-cache-path "$module_cache" \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker helpers/Info.plist

# Bind the embedded plist to the helper's ad-hoc local signature so macOS can
# associate the usage strings with its stable bundle identifier.
codesign --force --sign - helpers/listen
