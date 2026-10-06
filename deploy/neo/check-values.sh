#!/usr/bin/env bash
# Validates rollout.sh env wiring and safety checks without real infra hostnames.
# CI uses synthetic example.com URLs; production values live in GitHub Environments only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

fail() {
  echo "error: $*" >&2
  exit 1
}

run_plan() {
  local target="$1"
  shift
  (
    export GCP_PROJECT_ID="verifyax-${target}"
    export GKE_CLUSTER="verifyax-${target}"
    export GKE_REGION="europe-west2"
    export "$@"
    "${ROOT}/deploy/neo/rollout.sh" "$target" --plan
  )
}

# --- dev (synthetic hosts) ---
plan_dev="$(run_plan dev \
  IMAGE_TAG=dev-abc1234 \
  LOG_LEVEL=debug \
  ALLOWED_HOSTS='mcp.dev.example.com,mcp.dev.neo.example.com' \
  VERIFYAX_BASE_URL='https://webapp.dev.neo.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://webapp.dev.neo.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.dev.neo.example.com/health')"

grep -F 'image=europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:dev-abc1234' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not print the expected image"
grep -F 'namespace=verifyax-mcp-dev' <<<"$plan_dev" >/dev/null || fail "dev namespace drifted"
grep -F 'verifyax_base_url=https://webapp.dev.neo.example.com/api/v1' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not print VERIFYAX_BASE_URL"
grep -F 'allowed_hosts_env=mcp.dev.example.com,mcp.dev.neo.example.com,$(POD_IP)' <<<"$plan_dev" >/dev/null \
  || fail "dev plan did not keep the pod IP host reference"

# --- prod (synthetic hosts) ---
plan_prod="$(run_plan prod \
  LOG_LEVEL=info \
  ALLOWED_HOSTS='mcp.example.com,mcp.prod.example.com,mcp.prod.neo.example.com' \
  VERIFYAX_BASE_URL='https://console.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://console.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.prod.neo.example.com/health')"

pkg_version="$(node -p "require('./packages/mcp-server/package.json').version")"
grep -F "image=europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:${pkg_version}" <<<"$plan_prod" >/dev/null \
  || fail "prod plan did not tag the image with package.json version ${pkg_version}"
grep -F 'namespace=verifyax-mcp-prod' <<<"$plan_prod" >/dev/null || fail "prod namespace drifted"
grep -F 'log_level=info' <<<"$plan_prod" >/dev/null || fail "prod plan log level drifted"

# --- cross-environment guards ---
if run_plan dev \
  LOG_LEVEL=debug \
  ALLOWED_HOSTS='mcp.dev.example.com' \
  VERIFYAX_BASE_URL='https://console.verifyax.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://console.verifyax.com/web/api/v1' \
  HEALTH_URL='https://mcp.dev.example.com/health' >/dev/null 2>&1; then
  fail "dev plan accepted production console gateway URLs"
fi

if run_plan prod \
  LOG_LEVEL=info \
  ALLOWED_HOSTS='mcp.example.com' \
  VERIFYAX_BASE_URL='https://webapp.dev.neo.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://webapp.dev.neo.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.example.com/health' >/dev/null 2>&1; then
  fail "prod plan accepted dev gateway URLs"
fi

if run_plan dev LOG_LEVEL=info \
  ALLOWED_HOSTS='mcp.dev.example.com' \
  VERIFYAX_BASE_URL='https://webapp.dev.neo.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://webapp.dev.neo.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.dev.example.com/health' >/dev/null 2>&1; then
  fail "dev plan accepted LOG_LEVEL=info"
fi

# --- image tag guards ---
if IMAGE_TAG=latest run_plan dev \
  LOG_LEVEL=debug \
  ALLOWED_HOSTS='mcp.dev.example.com' \
  VERIFYAX_BASE_URL='https://webapp.dev.neo.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://webapp.dev.neo.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.dev.example.com/health' >/dev/null 2>&1; then
  fail "dev plan accepted tag latest"
fi

if IMAGE_TAG=latest run_plan prod \
  LOG_LEVEL=info \
  ALLOWED_HOSTS='mcp.example.com' \
  VERIFYAX_BASE_URL='https://console.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://console.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.example.com/health' >/dev/null 2>&1; then
  fail "prod plan accepted tag latest"
fi

if IMAGE_TAG=0.0.1 run_plan prod \
  LOG_LEVEL=info \
  ALLOWED_HOSTS='mcp.example.com' \
  VERIFYAX_BASE_URL='https://console.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://console.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.example.com/health' >/dev/null 2>&1; then
  fail "prod plan accepted an image tag that does not match package.json"
fi

if IMAGE_TAG=dev-zzzzzzz run_plan dev \
  LOG_LEVEL=debug \
  ALLOWED_HOSTS='mcp.dev.example.com' \
  VERIFYAX_BASE_URL='https://webapp.dev.neo.example.com/api/v1' \
  VERIFYAX_WEB_BASE_URL='https://webapp.dev.neo.example.com/web/api/v1' \
  HEALTH_URL='https://mcp.dev.example.com/health' >/dev/null 2>&1; then
  fail "dev plan accepted a non-hex sha tag"
fi

if "${ROOT}/deploy/neo/rollout.sh" dev --plan >/dev/null 2>&1; then
  fail "dev plan ran without required environment variables"
fi

echo "neo deploy config OK"
