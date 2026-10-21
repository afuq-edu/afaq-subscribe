#!/usr/bin/env bash
# build-release.sh V — build both «حاضر» zips for version V and run the release gate on each.
#   $R/release/hader-extension-V.zip   : cd extension && zip -qr
#   $R/chrome-store/hader-store-V.zip  : the same files, manifest passed through jq 'del(.key)'
# If either gate fails, BOTH zips are deleted and the script exits non-zero.
# R defaults to /mnt/project-files/afaq-platform (override with R=<dir> to build elsewhere).
set -euo pipefail

V="${1:?usage: tests/build-release.sh <version>   e.g. tests/build-release.sh 4.10.3}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT="$REPO/extension"
R="${R:-/mnt/project-files/afaq-platform}"
REL="$R/release/hader-extension-$V.zip"
STORE="$R/chrome-store/hader-store-$V.zip"
GATE="$REPO/tests/release-gate.mjs"

MV="$(jq -r .version "$EXT/manifest.json")"
if [ "$MV" != "$V" ]; then
  echo "!!! extension/manifest.json is version $MV, not $V — bump the manifest first" >&2
  exit 1
fi

mkdir -p "$R/release" "$R/chrome-store"
rm -f "$REL" "$STORE"   # zip -r into an existing archive would merge with stale entries

# 1. build
(cd "$EXT" && zip -qr "$REL" .)
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/hadir-store-XXXXXX")"
LOGS="$(mktemp -d "${TMPDIR:-/tmp}/hadir-gate-logs-XXXXXX")"
trap 'rm -rf "$STAGE" "$LOGS"' EXIT
cp -a "$EXT/." "$STAGE/"
jq 'del(.key)' "$EXT/manifest.json" > "$STAGE/manifest.json"
(cd "$STAGE" && zip -qr "$STORE" .)
echo "built $REL"
echo "built $STORE"

# 2. gate both (in parallel: each gate uses its own temp dirs, profiles and a free port)
set +e
node "$GATE" "$REL" > "$LOGS/release.log" 2>&1 & P1=$!
node "$GATE" "$STORE" > "$LOGS/store.log" 2>&1 & P2=$!
wait $P1; RC1=$?
wait $P2; RC2=$?
set -e
echo; echo "=== gate: $(basename "$REL")"; cat "$LOGS/release.log"
echo; echo "=== gate: $(basename "$STORE")"; cat "$LOGS/store.log"

# 3. fail loudly
if [ $RC1 -ne 0 ] || [ $RC2 -ne 0 ]; then
  rm -f "$REL" "$STORE"
  {
    echo
    echo "############################################################"
    echo "###  RELEASE GATE FAILED for حاضر $V — DO NOT SHIP"
    [ $RC1 -ne 0 ] && echo "###    release zip: FAILED ($(grep -c '^FAIL' "$LOGS/release.log") failing checks)"
    [ $RC2 -ne 0 ] && echo "###    store zip:   FAILED ($(grep -c '^FAIL' "$LOGS/store.log") failing checks)"
    echo "###  Both zips were deleted:"
    echo "###    $REL"
    echo "###    $STORE"
    echo "############################################################"
  } >&2
  exit 1
fi
echo
echo "RELEASE GATE PASSED for حاضر $V — both zips are ready:"
echo "  $REL"
echo "  $STORE"
