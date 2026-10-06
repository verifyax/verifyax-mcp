#!/usr/bin/env bash
# Static checks for deploy/neo values and rollout.sh --plan. No cluster, no Docker push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

fail() {
  echo "error: $*" >&2
  exit 1
}

require_line() {
  local file="$1" expected="$2"
  grep -F -x "$expected" "$file" >/dev/null || fail "${file} missing line: ${expected}"
}

DEV="${ROOT}/deploy/neo/values-dev.yaml"
PROD="${ROOT}/deploy/neo/values-prod.yaml"

require_line "$DEV" "environment: dev"
require_line "$DEV" "gcp_project: verifyax-dev"
require_line "$DEV" "gke_cluster: verifyax-dev"
require_line "$DEV" "namespace: verifyax-mcp-dev"
require_line "$DEV" "deployment: verifyax-mcp-dev"
require_line "$DEV" "replicas: 1"
require_line "$DEV" "log_level: debug"
require_line "$DEV" "allowed_hosts: verifyax-mcp.dev.conscium.ai,verifyax-mcp.dev.neo.conscium.ai"
require_line "$DEV" "verifyax_base_url: https://webapp.dev.neo.conscium.ai/api/v1"
require_line "$DEV" "verifyax_web_base_url: https://webapp.dev.neo.conscium.ai/web/api/v1"
require_line "$DEV" "health_url: https://verifyax-mcp.dev.neo.conscium.ai/health"
require_line "$DEV" "requests_cpu: 250m"
require_line "$DEV" "requests_memory: 256Mi"
require_line "$DEV" "limits_memory: 512Mi"

require_line "$PROD" "environment: prod"
require_line "$PROD" "gcp_project: verifyax-prod"
require_line "$PROD" "gke_cluster: verifyax-prod"
require_line "$PROD" "namespace: verifyax-mcp-prod"
require_line "$PROD" "deployment: verifyax-mcp-prod"
require_line "$PROD" "replicas: 1"
require_line "$PROD" "log_level: info"
require_line "$PROD" "allowed_hosts: mcp.verifyax.com,verifyax-mcp.prod.conscium.ai,verifyax-mcp.prod.neo.conscium.ai"
require_line "$PROD" "verifyax_base_url: https://console.verifyax.com/api/v1"
require_line "$PROD" "verifyax_web_base_url: https://console.verifyax.com/web/api/v1"
require_line "$PROD" "health_url: https://verifyax-mcp.prod.neo.conscium.ai/health"

if grep -E 'console\.verifyax\.com' "$DEV" >/dev/null; then
  fail "dev values must not point at the production gateway"
fi
if grep -E 'webapp\.dev\.neo\.conscium\.ai' "$PROD" >/dev/null; then
  fail "prod values must not point at the dev gateway"
fi
if grep -E '^image_tag:[[:space:]]*latest' "$DEV" "$PROD" >/dev/null; then
  fail "values files must not pin image_tag latest"
fi

plan_dev="$(IMAGE_TAG=dev-abc1234 "${ROOT}/deploy/neo/rollout.sh" dev --plan)"
grep -F 'image=europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:dev-abc1234' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not print the expected image"
grep -F 'verifyax_base_url=https://webapp.dev.neo.conscium.ai/api/v1' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not print the dev gateway"
grep -F 'allowed_hosts_env=verifyax-mcp.dev.conscium.ai,verifyax-mcp.dev.neo.conscium.ai,$(POD_IP)' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not keep the pod IP host reference"

plan_prod="$("${ROOT}/deploy/neo/rollout.sh" prod --plan)"
pkg_version="$(node -p "require('./packages/mcp-server/package.json').version")"
grep -F "image=europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:${pkg_version}" <<<"$plan_prod" >/dev/null \
  || fail "prod plan did not tag the image with package.json version ${pkg_version}"
grep -F 'verifyax_base_url=https://console.verifyax.com/api/v1' <<<"$plan_prod" >/dev/null \
  || fail "prod plan did not print the production gateway"
grep -F 'log_level=info' <<<"$plan_prod" >/dev/null || fail "prod plan log level drifted"

if IMAGE_TAG=latest "${ROOT}/deploy/neo/rollout.sh" dev --plan >/dev/null 2>&1; then
  fail "dev plan accepted tag latest"
fi
if IMAGE_TAG=latest "${ROOT}/deploy/neo/rollout.sh" prod --plan >/dev/null 2>&1; then
  fail "prod plan accepted tag latest"
fi
if IMAGE_TAG=0.0.1 "${ROOT}/deploy/neo/rollout.sh" prod --plan >/dev/null 2>&1; then
  fail "prod plan accepted an image tag that does not match package.json"
fi
if IMAGE_TAG=dev-zzzzzzz "${ROOT}/deploy/neo/rollout.sh" dev --plan >/dev/null 2>&1; then
  fail "dev plan accepted a non-hex sha tag"
fi

echo "neo deploy config OK"
