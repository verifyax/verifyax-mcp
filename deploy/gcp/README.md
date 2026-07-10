# Deploy VerifyAX MCP to Google Cloud Run (Streamable HTTP)

This runs `@verifyax/mcp-server` in **Streamable HTTP** mode on Cloud Run. Clients authenticate with their own **VerifyAX API key** on each session — the server does not store one. Local **stdio** mode is unchanged — see [`packages/mcp-server/README.md`](../../packages/mcp-server/README.md).

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI authenticated
- Permission to create Artifact Registry repos (or pre-create repo `verifyax-mcp` in your region)

## Build and deploy

The easiest path is the deploy script (creates the Artifact Registry repo if needed). It requires
`GCP_PROJECT` and `VERIFYAX_MCP_ALLOWED_HOSTS` — there is no shared default project:

```bash
export GCP_PROJECT=your-project-id
export VERIFYAX_MCP_ALLOWED_HOSTS=mcp.verifyax.com,verifyax-mcp-xxxxx-uc.a.run.app

./deploy/gcp/deploy.sh
```

Replace `verifyax-mcp-xxxxx-uc.a.run.app` with your Cloud Run hostname after the first deploy, or
include your custom domain if you map one.

Or manually from the **repository root**:

```bash
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1
export SERVICE_NAME=verifyax-mcp
export AR_REPO=verifyax-mcp
export VERIFYAX_MCP_ALLOWED_HOSTS=mcp.verifyax.com,verifyax-mcp-xxxxx-uc.a.run.app
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
  --timeout 1800 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 512Mi \
  --update-env-vars "VERIFYAX_MCP_LOG_LEVEL=info,VERIFYAX_MCP_ALLOWED_HOSTS=${VERIFYAX_MCP_ALLOWED_HOSTS}"
```

`VERIFYAX_MCP_ALLOWED_HOSTS` is **required** — the server refuses to bind a public interface
without it (Host-header validation). `--max-instances 1` is deliberate: sessions live in
per-process memory, so the service can't scale out until session state is externalized. Put Cloud
Armor / a rate-limiting gateway in front, and configure a Cloud Run HTTP probe against `/health`.

After deploy, note the service URL, e.g. `https://verifyax-mcp-xxxxx-uc.a.run.app`. See
[Choosing the service URL](#choosing-the-service-url) to control the hostname or map a custom
domain.

### Push denied / Artifact Registry permissions

If Cloud Build cannot push the image, grant the Cloud Build service account write access:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

## Choosing the service URL

You can target a specific URL in two ways: the default Cloud Run hostname (partially
controllable) or a custom domain (fully controllable).

### Default Cloud Run URL (`*.run.app`)

The deploy script reads these environment variables:

| Variable                     | Default               | Effect on URL                             |
| ---------------------------- | --------------------- | ----------------------------------------- |
| `GCP_PROJECT`                | required (no default) | Affects the hash in the middle of the URL |
| `VERIFYAX_MCP_ALLOWED_HOSTS` | required (no default) | Hostnames allowed to reach `/mcp`         |
| `GCP_REGION`                 | `us-central1`         | Region suffix (`uc`, `ew`, etc.)          |
| `SERVICE_NAME`               | `verifyax-mcp`        | Prefix of the URL                         |

Deploy with your choices:

```bash
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1          # or europe-west1, etc.
export SERVICE_NAME=verifyax-mcp         # → https://verifyax-mcp-XXXXX-uc.a.run.app
export VERIFYAX_MCP_ALLOWED_HOSTS=mcp.verifyax.com,verifyax-mcp-XXXXX-uc.a.run.app

./deploy/gcp/deploy.sh
```

After deploy, get the exact URL:

```bash
gcloud run services describe verifyax-mcp \
  --region us-central1 \
  --format 'value(status.url)'
```

You control the **service name prefix** and **region**, but GCP assigns the hash (`XXXXX`) — you
cannot pick the full `*.run.app` URL.

**MCP client URL:** append `/mcp`, e.g. `https://verifyax-mcp-xxxxx-uc.a.run.app/mcp`.

### Custom domain

To serve at a URL you fully control (e.g. `https://mcp.example.com/mcp`):

**1. Map the domain in Cloud Run**

```bash
gcloud run domain-mappings create \
  --service verifyax-mcp \
  --domain mcp.example.com \
  --region us-central1
```

**2. Add DNS records**

`gcloud` prints the required CNAME or A records. Add them at your DNS provider.

**3. Allow the custom host in the server**

The server can reject unknown `Host` headers. Set both your custom domain and the default
`.run.app` hostname (from `gcloud run services describe`):

```bash
gcloud run services update verifyax-mcp \
  --region us-central1 \
  --update-env-vars "VERIFYAX_MCP_LOG_LEVEL=info,VERIFYAX_MCP_ALLOWED_HOSTS=mcp.example.com,verifyax-mcp-xxxxx-uc.a.run.app"
```

**4. Point MCP clients at the custom URL**

```json
{
  "mcpServers": {
    "verifyax": {
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer sk-ver-api-..."
      }
    }
  }
}
```

| Goal                       | What to do                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Deploy to a project/region | Set `GCP_PROJECT`, `VERIFYAX_MCP_ALLOWED_HOSTS`, `GCP_REGION`, run `./deploy/gcp/deploy.sh` |
| Change URL prefix          | Set `SERVICE_NAME` before deploy                                                            |
| Use your own domain        | `gcloud run domain-mappings create` + DNS + `VERIFYAX_MCP_ALLOWED_HOSTS`                    |
| Verify deployment          | `curl -s https://YOUR-URL/health` → `{"status":"ok"}`                                       |

## Health check

```bash
curl -s "https://YOUR-SERVICE-URL/health"
# {"status":"ok"}
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

| Setting             | Why                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--max-instances 1` | Sessions live in per-process memory; a single instance avoids cross-instance session-not-found errors        |
| `--timeout 1800`    | Enough for the longest blocking tool (`evaluate_agent`, ~20min) without holding connections open for an hour |
| `--min-instances 1` | Avoid cold starts dropping active MCP sessions                                                               |
| `--update-env-vars` | Merges env vars, so `VERIFYAX_MCP_ALLOWED_HOSTS` is not wiped on redeploy                                    |

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
