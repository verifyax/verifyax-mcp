# Deploy VerifyAX MCP to Google Cloud Run (Streamable HTTP)

This runs `@verifyax/mcp-server` in **Streamable HTTP** mode on Cloud Run. Clients authenticate with their own **VerifyAX API key** on each session — the server does not store one. Local **stdio** mode is unchanged — see [`packages/mcp-server/README.md`](../../packages/mcp-server/README.md).

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI authenticated
- Permission to create Artifact Registry repos (or pre-create repo `verifyax-mcp` in your region)

## Build and deploy

The easiest path is the deploy script (creates the Artifact Registry repo if needed):

```bash
./deploy/gcp/deploy.sh
```

Or manually from the **repository root**:

```bash
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1
export SERVICE_NAME=verifyax-mcp
export AR_REPO=verifyax-mcp
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:latest"

gcloud config set project "$GCP_PROJECT"

gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="VerifyAX MCP server images" \
  2>/dev/null || true

gcloud builds submit . \
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
```

After deploy, note the service URL, e.g. `https://verifyax-mcp-xxxxx-uc.a.run.app`.

### Push denied / Artifact Registry permissions

If Cloud Build cannot push the image, grant the Cloud Build service account write access:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

## Health check

```bash
curl -s "https://YOUR-SERVICE-URL/health"
# {"status":"ok","transport":"streamable-http"}
```

## MCP client configuration

Point a Streamable HTTP–capable client at `/mcp` and send the caller's VerifyAX API key on the initialize request:

```json
{
  "mcpServers": {
    "verifyax": {
      "url": "https://YOUR-SERVICE-URL/mcp",
      "headers": {
        "Authorization": "Bearer sk-ver-api-..."
      }
    }
  }
}
```

Omit the `transport` field in Cursor. If URL mode fails, use `mcp-remote` with `--transport http-only` (see [`packages/mcp-server/README.md`](../../packages/mcp-server/README.md)).

Alternatively use the `X-VerifyAX-API-Key` header instead of `Authorization`.

Each user connects with their own key; usage is billed to their VerifyAX workspace.

## Cloud Run settings explained

| Setting              | Why                                                                         |
| -------------------- | --------------------------------------------------------------------------- |
| `--session-affinity` | MCP Streamable HTTP uses in-memory sessions per instance                    |
| `--timeout 3600`     | Blocking tools (`generate_scenario`, `evaluate_agent`) can run many minutes |
| `--min-instances 1`  | Avoid cold starts dropping active MCP sessions                              |

## Optional: restrict Host header

If you use a custom domain, set allowed hosts:

```bash
--set-env-vars "VERIFYAX_MCP_ALLOWED_HOSTS=verifyax-mcp.example.com,verifyax-mcp-xxxxx-ew.a.run.app"
```

## Local HTTP (before deploying)

```bash
pnpm build
node packages/mcp-server/dist/http.js
# → http://127.0.0.1:8080/mcp  (send API key in Authorization header when connecting)
```

**stdio** (Cursor, Claude Desktop):

```bash
VERIFYAX_API_KEY=sk-ver-api-... node packages/mcp-server/dist/index.js
```

| Endpoint               | Purpose             |
| ---------------------- | ------------------- |
| `POST/GET/DELETE /mcp` | Streamable HTTP MCP |
| `GET /health`          | Health check        |
