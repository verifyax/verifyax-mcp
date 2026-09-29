#!/usr/bin/env bash
# Deploy verifyax-mcp to Cloud Run. Run from anywhere; the script cd's to the repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Require an explicit project (no shared-sandbox default) and the served-host
# allowlist. Host-header validation is mandatory for the public endpoint — the
# server refuses to start on 0.0.0.0 without VERIFYAX_MCP_ALLOWED_HOSTS.
GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT to your target project (no shared default).}"
VERIFYAX_MCP_ALLOWED_HOSTS="${VERIFYAX_MCP_ALLOWED_HOSTS:?Set VERIFYAX_MCP_ALLOWED_HOSTS to the host(s) serving /mcp, e.g. mcp.verifyax.com,<service>-<hash>-uc.a.run.app}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-verifyax-mcp}"
AR_REPO="${AR_REPO:-verifyax-mcp}"

# Tag by version + commit, never a bare `:latest`.
#
# With a fixed `:latest` tag the --image argument to `gcloud run deploy` never
# changes, so Cloud Run can decide there is nothing to roll out and quietly keep
# serving the previous revision: a deploy that reports success while changing
# nothing. That has happened -- the endpoint sat on 0.3.5 after a 0.3.6 deploy,
# and before that drifted four releases behind without anyone being able to tell
# from the outside.
#
# A tag that changes with the build guarantees a new revision, and makes the
# running version readable from the image reference alone rather than needing an
# authenticated `initialize` call to find out.
VERSION="$(node -p "require('./packages/mcp-server/package.json').version")"
GIT_SHA="$(git -C "$ROOT" rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
# Remember whether the caller chose the tag, so the dirty-tree guard below can
# treat an explicit IMAGE_TAG as "I know, ship it anyway".
IMAGE_TAG_EXPLICIT="${IMAGE_TAG:-}"
IMAGE_TAG="${IMAGE_TAG:-${VERSION}-${GIT_SHA}}"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

# Refuse to deploy a dirty tree: the tag would claim a commit whose contents are
# not what is being shipped.
if [ -z "$IMAGE_TAG_EXPLICIT" ] && [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  echo "error: working tree is dirty, so the tag ${IMAGE_TAG} would name a commit" >&2
  echo "       whose contents are not what gets built. Commit or stash first, or" >&2
  echo "       set IMAGE_TAG=<something> to ship anyway." >&2
  exit 1
fi

echo "Deploying ${SERVICE_NAME} ${VERSION} (${GIT_SHA}) to ${GCP_REGION}"

gcloud config set project "$GCP_PROJECT"

# gcr.io is deprecated; use Artifact Registry (repo must exist before Cloud Build pushes).
gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com \
  --project="$GCP_PROJECT" >/dev/null

if ! gcloud artifacts repositories describe "$AR_REPO" \
  --location="$GCP_REGION" \
  --project="$GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repo: ${AR_REPO} (${GCP_REGION})"
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT" \
    --description="VerifyAX MCP server images"
fi

gcloud builds submit "$ROOT" \
  --config deploy/gcp/cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}"

# Notes on the flags below:
#  --max-instances 1: sessions are per-process in memory, so the service cannot
#    scale out correctly; pin to a single instance rather than advertise a scale
#    it can't honor (OPS-1). Externalizing session state is the prerequisite to
#    raising this.
#  --update-env-vars (not --set-env-vars): merges, so a previously-set var is not
#    silently wiped on redeploy (OPS-4).
#  --timeout 1800: enough for the longest blocking tool (evaluate_agent, ~20min)
#    without holding a connection open for a full hour (ARCH-4 / abuse surface).
#  Perimeter: put Cloud Armor / a rate-limiting gateway in front of this service,
#    and consider dropping --allow-unauthenticated for an IAM/gateway front door.
#  Health: configure a Cloud Run HTTP startup/liveness probe against /health.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --timeout 1800 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 512Mi \
  --update-env-vars "VERIFYAX_MCP_LOG_LEVEL=info,VERIFYAX_MCP_ALLOWED_HOSTS=${VERIFYAX_MCP_ALLOWED_HOSTS}"

URL="$(gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION" --format 'value(status.url)')"
echo "Deployed: $URL"
echo "Image:    $IMAGE"

# A deploy that changes nothing used to look identical to one that worked, so
# confirm the live service is actually serving the image just built.
SERVING="$(gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION"   --format 'value(spec.template.spec.containers[0].image)' 2>/dev/null || true)"
if [ "$SERVING" != "$IMAGE" ]; then
  echo "error: the service is serving ${SERVING:-<unknown>}, not the image just built." >&2
  echo "       The rollout did not take. Check: gcloud run revisions list --service ${SERVICE_NAME} --region ${GCP_REGION}" >&2
  exit 1
fi
echo "Verified: the service is serving ${IMAGE}"
