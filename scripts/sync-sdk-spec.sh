#!/usr/bin/env bash
#
# sync-sdk-spec.sh — pull the canonical VerifyAX OpenAPI spec into the SDK mirror,
# then regenerate the typed schemas from it. The mirror is the single source of
# truth the SDK types derive from (do not hand-edit packages/sdk/src/types.gen.ts).
#
# Usage: scripts/sync-sdk-spec.sh
set -euo pipefail

SPEC_URL="${SPEC_URL:-https://console.verifyax.com/openapi.yaml}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/packages/sdk/openapi/verifyax.yaml"

echo "Fetching $SPEC_URL"
mkdir -p "$(dirname "$OUT")"
curl -fsSL --retry 3 --retry-delay 2 --max-time 60 "$SPEC_URL" -o "$OUT"
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"

echo "Regenerating SDK types + spec provenance"
( cd "$REPO_ROOT" && pnpm gen:types && pnpm gen:spec-meta )
echo "Done. Review the diff in packages/sdk/openapi/{verifyax.yaml,verifyax.meta.json} and src/types.gen.ts."
