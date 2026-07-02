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
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:latest"

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

echo "Deployed: $(gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION" --format 'value(status.url)')"
