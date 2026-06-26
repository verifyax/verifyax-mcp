#!/usr/bin/env bash
# Deploy verifyax-mcp to Cloud Run. Run from anywhere; the script cd's to the repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

GCP_PROJECT="${GCP_PROJECT:-platform-agent-sandbox}"
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

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --session-affinity \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 3 \
  --memory 512Mi \
  --set-env-vars "VERIFYAX_MCP_LOG_LEVEL=info"

echo "Deployed: $(gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION" --format 'value(status.url)')"
