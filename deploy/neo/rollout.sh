#!/usr/bin/env bash
# Build deploy/gcp/Dockerfile, push it, and roll the existing Neo GKE Deployment.
# Does not run Terraform. Authenticate gcloud (or GitHub Workload Identity) first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: deploy/neo/rollout.sh <dev|prod> [--plan]

  --plan   Print the image tag and env that would be applied, then exit.
           Does not build, push, or touch the cluster.

Image tags:
  dev    dev-<7 char git sha>     (override with IMAGE_TAG)
  prod   @verifyax/mcp-server version from packages/mcp-server/package.json

Refuses the tag "latest". A prod IMAGE_TAG must match package.json.

GCP_PROJECT_ID, GKE_CLUSTER, and GKE_REGION override the values file when set.
EOF
}

read_value() {
  local file="$1" key="$2" line val
  line="$(grep -E "^${key}:" "$file" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo "error: ${file} is missing ${key}" >&2
    exit 1
  fi
  val="${line#*:}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  if [[ -z "$val" ]]; then
    echo "error: ${file} ${key} is empty" >&2
    exit 1
  fi
  printf '%s' "$val"
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

VALUES="${ROOT}/deploy/neo/values-${TARGET}.yaml"
if [[ ! -f "$VALUES" ]]; then
  echo "error: missing ${VALUES}" >&2
  exit 1
fi

ENVIRONMENT="$(read_value "$VALUES" environment)"
if [[ "$ENVIRONMENT" != "$TARGET" ]]; then
  echo "error: ${VALUES} environment is ${ENVIRONMENT}, expected ${TARGET}" >&2
  exit 1
fi

GCP_PROJECT="${GCP_PROJECT_ID:-$(read_value "$VALUES" gcp_project)}"
GKE_CLUSTER="${GKE_CLUSTER:-$(read_value "$VALUES" gke_cluster)}"
GKE_REGION="${GKE_REGION:-$(read_value "$VALUES" gke_region)}"
NAMESPACE="$(read_value "$VALUES" namespace)"
DEPLOYMENT="$(read_value "$VALUES" deployment)"
CONTAINER="$(read_value "$VALUES" container)"
REGISTRY_IMAGE="$(read_value "$VALUES" registry_image)"
LOG_LEVEL="$(read_value "$VALUES" log_level)"
ALLOWED_HOSTS="$(read_value "$VALUES" allowed_hosts)"
BASE_URL="$(read_value "$VALUES" verifyax_base_url)"
WEB_BASE_URL="$(read_value "$VALUES" verifyax_web_base_url)"
HEALTH_URL="$(read_value "$VALUES" health_url)"
REPLICAS="$(read_value "$VALUES" replicas)"

if [[ "$REPLICAS" != "1" ]]; then
  echo "error: replicas must stay 1 (in-process MCP sessions); ${VALUES} has ${REPLICAS}" >&2
  exit 1
fi

# Literal $(POD_IP): kubelet expands it from the Downward API env already on the pod.
# Terraform's Deployment template uses the same reference for /health Host checks.
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
echo "gke_cluster=${GKE_CLUSTER}"
echo "gke_region=${GKE_REGION}"
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

gcloud container clusters get-credentials "$GKE_CLUSTER" \
  --region "$GKE_REGION" \
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
