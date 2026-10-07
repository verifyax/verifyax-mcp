#!/usr/bin/env bash
# Build deploy/gcp/Dockerfile, push it, and roll the existing Neo GKE Deployment.
# Does not run Terraform. Authenticate gcloud (or GitHub Workload Identity) first.
#
# Runtime targeting (hosts, gateway URLs, health URL, GCP project/cluster) comes from
# environment variables — set on GitHub Environment dev/prod for Actions, or export /
# deploy/neo/local/<dev|prod>.env for local operators (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

REGISTRY_IMAGE="europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp"
CONTAINER="verifyax-mcp"

usage() {
  cat <<'EOF'
Usage: deploy/neo/rollout.sh <dev|prod> [--plan]

  --plan   Print the image tag and env that would be applied, then exit.
           Does not build, push, or touch the cluster.

Image tags:
  dev    dev-<7 char git sha>     (override with IMAGE_TAG)
  prod   @verifyax/mcp-server version from packages/mcp-server/package.json

Refuses the tag "latest". A prod IMAGE_TAG must match package.json.

Required environment variables (GitHub Environment vars on deploy workflows):
  GCP_PROJECT_ID, GKE_CLUSTER, GKE_REGION
  ALLOWED_HOSTS          Comma-separated public MCP hostnames (no $(POD_IP))
  LOG_LEVEL              debug (dev) or info (prod)
  VERIFYAX_BASE_URL      Gateway /api/v1 base
  VERIFYAX_WEB_BASE_URL  Gateway /web/api/v1 base
  HEALTH_URL             HTTPS URL for post-deploy curl (/health)

Local operators may place exports in deploy/neo/local/<dev|prod>.env (gitignored).
EOF
}

require_env() {
  local name="$1"
  local val="${!name:-}"
  if [[ -z "$val" ]]; then
    echo "error: ${name} is not set (GitHub Environment variable or deploy/neo/local/<env>.env)" >&2
    exit 1
  fi
  printf '%s' "$val"
}

validate_target_env() {
  local target="$1"
  local log_level="$2"
  local base_url="$3"
  local web_base_url="$4"
  local health_url="$5"

  case "$target" in
    dev)
      if [[ "$log_level" != "debug" ]]; then
        echo "error: dev rollout requires LOG_LEVEL=debug, got ${log_level}" >&2
        exit 1
      fi
      if [[ "$base_url" == *console.verifyax.com* || "$web_base_url" == *console.verifyax.com* ]]; then
        echo "error: dev VERIFYAX_* URLs must not point at the production console gateway" >&2
        exit 1
      fi
      ;;
    prod)
      if [[ "$log_level" != "info" ]]; then
        echo "error: prod rollout requires LOG_LEVEL=info, got ${log_level}" >&2
        exit 1
      fi
      if [[ "$base_url" == *webapp.dev.neo* || "$web_base_url" == *webapp.dev.neo* ]]; then
        echo "error: prod VERIFYAX_* URLs must not point at the dev gateway" >&2
        exit 1
      fi
      ;;
  esac

  case "$health_url" in
    https://*) ;;
    *)
      echo "error: HEALTH_URL must be https, got ${health_url}" >&2
      exit 1
      ;;
  esac

  if [[ "$base_url" != https://* || "$web_base_url" != https://* ]]; then
    echo "error: VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL must use https" >&2
    exit 1
  fi
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

TARGET="$1"
PLAN=false
if [[ $# -eq 2 ]]; then
  if [[ "$2" != "--plan" ]]; then
    echo "error: unknown argument: $2" >&2
    usage >&2
    exit 1
  fi
  PLAN=true
fi

case "$TARGET" in
  dev | prod) ;;
  *)
    echo "error: target must be dev or prod" >&2
    usage >&2
    exit 1
    ;;
esac

LOCAL_ENV="${ROOT}/deploy/neo/local/${TARGET}.env"
if [[ -f "$LOCAL_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV"
  set +a
fi

ENVIRONMENT="$TARGET"
NAMESPACE="verifyax-mcp-${TARGET}"
DEPLOYMENT="verifyax-mcp-${TARGET}"

GCP_PROJECT="$(require_env GCP_PROJECT_ID)"
GKE_CLUSTER_NAME="$(require_env GKE_CLUSTER)"
GKE_REGION_NAME="$(require_env GKE_REGION)"
LOG_LEVEL="$(require_env LOG_LEVEL)"
ALLOWED_HOSTS="$(require_env ALLOWED_HOSTS)"
BASE_URL="$(require_env VERIFYAX_BASE_URL)"
WEB_BASE_URL="$(require_env VERIFYAX_WEB_BASE_URL)"
HEALTH_URL="$(require_env HEALTH_URL)"

validate_target_env "$TARGET" "$LOG_LEVEL" "$BASE_URL" "$WEB_BASE_URL" "$HEALTH_URL"

# Literal $(POD_IP): kubelet expands it from the Downward API env already on the pod.
HOSTS_ENV="${ALLOWED_HOSTS},\$(POD_IP)"

PKG_VERSION="$(node -p "require('${ROOT}/packages/mcp-server/package.json').version")"
IMAGE_TAG_EXPLICIT="${IMAGE_TAG:-}"

case "$TARGET" in
  dev)
    if [[ -z "$IMAGE_TAG_EXPLICIT" ]]; then
      GIT_SHA="$(git -C "$ROOT" rev-parse --short=7 HEAD)"
      IMAGE_TAG="dev-${GIT_SHA}"
    else
      IMAGE_TAG="$IMAGE_TAG_EXPLICIT"
    fi
    if [[ ! "$IMAGE_TAG" =~ ^dev-[0-9a-f]{7}$ ]]; then
      echo "error: dev image tag must look like dev-abc1234, got ${IMAGE_TAG}" >&2
      exit 1
    fi
    ;;
  prod)
    if [[ -z "$IMAGE_TAG_EXPLICIT" ]]; then
      IMAGE_TAG="$PKG_VERSION"
    else
      IMAGE_TAG="$IMAGE_TAG_EXPLICIT"
    fi
    if [[ "$IMAGE_TAG" != "$PKG_VERSION" ]]; then
      echo "error: prod image tag ${IMAGE_TAG} does not match package.json ${PKG_VERSION}" >&2
      echo "       Check out the release tag and run again so the built source matches the tag." >&2
      exit 1
    fi
    if [[ ! "$IMAGE_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "error: prod image tag must be plain semver, got ${IMAGE_TAG}" >&2
      exit 1
    fi
    ;;
esac

if [[ "$IMAGE_TAG" == "latest" || "$IMAGE_TAG" == *latest* ]]; then
  echo "error: refusing to deploy a latest tag (${IMAGE_TAG})" >&2
  exit 1
fi

IMAGE="${REGISTRY_IMAGE}:${IMAGE_TAG}"

echo "environment=${ENVIRONMENT}"
echo "image=${IMAGE}"
echo "namespace=${NAMESPACE}"
echo "deployment=${DEPLOYMENT}"
echo "container=${CONTAINER}"
echo "gcp_project=${GCP_PROJECT}"
echo "gke_cluster=${GKE_CLUSTER_NAME}"
echo "gke_region=${GKE_REGION_NAME}"
echo "log_level=${LOG_LEVEL}"
echo "verifyax_base_url=${BASE_URL}"
echo "verifyax_web_base_url=${WEB_BASE_URL}"
echo "allowed_hosts_env=${HOSTS_ENV}"
echo "health_url=${HEALTH_URL}"

if [[ "$PLAN" == true ]]; then
  exit 0
fi

if [[ -z "$IMAGE_TAG_EXPLICIT" && -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]]; then
  echo "error: working tree is dirty, so ${IMAGE_TAG} would not match what gets built." >&2
  echo "       Commit or stash first, or set IMAGE_TAG to ship anyway." >&2
  exit 1
fi

echo "Building ${IMAGE}"
docker build --platform linux/amd64 -f deploy/gcp/Dockerfile -t "$IMAGE" "$ROOT"

gcloud auth configure-docker europe-west2-docker.pkg.dev --quiet
echo "Pushing ${IMAGE}"
docker push "$IMAGE"

gcloud container clusters get-credentials "$GKE_CLUSTER_NAME" \
  --region "$GKE_REGION_NAME" \
  --project "$GCP_PROJECT"

PATCH_FILE="$(mktemp)"
trap 'rm -f "$PATCH_FILE"' EXIT
node --input-type=module - "$PATCH_FILE" "$CONTAINER" "$IMAGE" "$LOG_LEVEL" "$HOSTS_ENV" "$BASE_URL" "$WEB_BASE_URL" <<'EOF'
import { writeFileSync } from 'node:fs';

const [file, container, image, logLevel, hosts, baseUrl, webBaseUrl] = process.argv.slice(2);
writeFileSync(
  file,
  JSON.stringify({
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: container,
              image,
              env: [
                { name: 'VERIFYAX_MCP_LOG_LEVEL', value: logLevel },
                { name: 'VERIFYAX_MCP_ALLOWED_HOSTS', value: hosts },
                { name: 'VERIFYAX_BASE_URL', value: baseUrl },
                { name: 'VERIFYAX_WEB_BASE_URL', value: webBaseUrl },
              ],
            },
          ],
        },
      },
    },
  })
);
EOF

kubectl patch deployment "$DEPLOYMENT" -n "$NAMESPACE" --type strategic --patch-file "$PATCH_FILE"
kubectl rollout status -n "$NAMESPACE" "deployment/${DEPLOYMENT}" --timeout=10m

LIVE="$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" \
  -o jsonpath="{.spec.template.spec.containers[?(@.name=='${CONTAINER}')].image}")"
if [[ "$LIVE" != "$IMAGE" ]]; then
  echo "error: ${DEPLOYMENT} is serving ${LIVE:-<unknown>}, not ${IMAGE}" >&2
  exit 1
fi
echo "Verified image: ${LIVE}"

LIVE_BASE="$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" \
  -o jsonpath="{.spec.template.spec.containers[?(@.name=='${CONTAINER}')].env[?(@.name=='VERIFYAX_BASE_URL')].value}")"
if [[ "$LIVE_BASE" != "$BASE_URL" ]]; then
  echo "error: VERIFYAX_BASE_URL is ${LIVE_BASE:-<unset>}, expected ${BASE_URL}" >&2
  exit 1
fi

echo "Waiting for ${HEALTH_URL}"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" | grep -q '"status":"ok"'; then
    ok=1
    break
  fi
  sleep 5
done
if [[ "$ok" != "1" ]]; then
  echo "error: ${HEALTH_URL} did not return {\"status\":\"ok\"}" >&2
  exit 1
fi
echo "Verified health: ${HEALTH_URL}"
