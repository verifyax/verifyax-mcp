# GitHub setup for Neo MCP deploys

Operator runbook for `verifyax/verifyax-mcp`: GitHub Environments, environment variables, and GCP Workload Identity before **dev** / **prod** GKE rollouts. Day-to-day rollout behavior, rollback, and Terraform drift are in [README.md](README.md).

This repo is **public**; live hostnames and gateway URLs are **not** in `rollout.sh` or committed config. They are set once as **GitHub Environment variables** (and optionally mirrored in gitignored `local/<env>.env` for local `rollout.sh`).

---

## Prerequisites

- Maintainer access to `verifyax/verifyax-mcp` (Environments, Actions, variables).
- Read access to the private **verification** repo for Terraform truth (`infra/GCP-NEO/applications/verifyax-mcp/`).
- `gh` CLI authenticated (`gh auth login`) and `gcloud` for WIF provider lookup.
- Neo automation merged to **`main`** (`deploy-neo-dev.yml`, `deploy-neo-prod.yml`, CI on `dev`, **Publish**, **Publish to MCP Registry**).

---

## Bootstrap order

| Step | Action                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Merge Neo workflow files to **`main`**. `workflow_run` jobs (**dev deploy**, auto **Publish**) only register when the workflow file exists on **`main`**. |
| 2    | Create GitHub Environments **`dev`** and **`prod`**; set all variables (below).                                                                           |
| 3    | Extend GCP Workload Identity so **`verifyax/verifyax-mcp`** can impersonate the deployer SA (below).                                                      |
| 4    | Confirm npm **Trusted Publishing** for **Publish** (OIDC; no `NPM_TOKEN` on deploy paths).                                                                |
| 5    | Create branch **`dev`** from **`main`**; integration PRs target **`dev`**, releases target **`main`**.                                                    |
| 6    | Smoke: push to **`dev`** → CI green → **Deploy Neo MCP (dev)**; after a release, manual **Deploy Neo MCP (prod)** with `vX.Y.Z`.                          |

---

## Create environments

**UI:** Repository → **Settings** → **Environments** → **New environment** → `dev`, then `prod`.

**`prod`:** enable **Required reviewers** so production rollouts need approval. **`dev`** can stay unprotected.

Deploy workflows set `environment: dev` or `environment: prod`, so each job reads **`vars.*` only from that environment** (not repository-level variables).

```bash
REPO=verifyax/verifyax-mcp

gh api --method PUT "repos/${REPO}/environments/dev" -f prevent_self_review=false
gh api --method PUT "repos/${REPO}/environments/prod"
# Add reviewers for prod in the UI (deployment protection rules).
```

---

## Environment variables (required)

Ten variables per environment. Names are **case-sensitive** and must match what [deploy-neo-dev.yml](../../.github/workflows/deploy-neo-dev.yml) and [deploy-neo-prod.yml](../../.github/workflows/deploy-neo-prod.yml) pass into `rollout.sh`.

| Variable                     | Maps to / used for                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`             | `gcloud` project hosting the GKE cluster                                                                                          |
| `GKE_CLUSTER`                | Cluster name for `get-credentials`                                                                                                |
| `GKE_REGION`                 | Cluster region (Neo uses `europe-west2`)                                                                                          |
| `WORKLOAD_IDENTITY_PROVIDER` | Full resource name of the GitHub OIDC provider (same on dev and prod)                                                             |
| `SERVICE_ACCOUNT_EMAIL`      | GCP SA to impersonate (`github-actions-deployer@verifyax-core.iam.gserviceaccount.com`)                                           |
| `ALLOWED_HOSTS`              | Comma-separated MCP ingress hostnames → pod env `VERIFYAX_MCP_ALLOWED_HOSTS` (do **not** include `$(POD_IP)`; rollout appends it) |
| `LOG_LEVEL`                  | Pod env `VERIFYAX_MCP_LOG_LEVEL` — **`debug`** on dev, **`info`** on prod (`rollout.sh` enforces)                                 |
| `VERIFYAX_BASE_URL`          | Pod env gateway `/api/v1` base                                                                                                    |
| `VERIFYAX_WEB_BASE_URL`      | Pod env gateway `/web/api/v1` base                                                                                                |
| `HEALTH_URL`                 | Post-deploy HTTPS check (must return `{"status":"ok"}`)                                                                           |

### Source of truth

| GitHub variable                 | Primary source                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_HOSTS`                 | verification `infra/GCP-NEO/applications/verifyax-mcp/values-<env>.yaml` → `allowed_hosts`                                                                          |
| `LOG_LEVEL`                     | same file → `log_level`                                                                                                                                             |
| `GCP_PROJECT_ID`, `GKE_CLUSTER` | verification `environments/<env>/main.tf` project id and cluster naming (`verifyax-dev` / `verifyax-prod`)                                                          |
| `VERIFYAX_*` URLs               | verification `infra/GCP-NEO/applications/verifyax-mcp/values-<env>.yaml` → `verifyax_base_url`, `verifyax_web_base_url` (keep GitHub vars in sync for `rollout.sh`) |
| `HEALTH_URL`                    | Pick one public MCP hostname from `ALLOWED_HOSTS` (Neo hostname is typical) + `/health`.                                                                            |

When verification `allowed_hosts` or gateways change, update the matching **GitHub Environment** variables and re-run deploy (or `rollout.sh`). No change is required in this public repo.

### Canonical values (Neo as of verification `values-*.yaml`)

Use these when seeding GitHub Environments. Re-read verification before go-live in case YAML drifted.

**Environment `dev`**

| Variable                     | Value                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `GCP_PROJECT_ID`             | `verifyax-dev`                                                  |
| `GKE_CLUSTER`                | `verifyax-dev`                                                  |
| `GKE_REGION`                 | `europe-west2`                                                  |
| `WORKLOAD_IDENTITY_PROVIDER` | _(from gcloud command below)_                                   |
| `SERVICE_ACCOUNT_EMAIL`      | `github-actions-deployer@verifyax-core.iam.gserviceaccount.com` |
| `ALLOWED_HOSTS`              | `verifyax-mcp.dev.conscium.ai,verifyax-mcp.dev.neo.conscium.ai` |
| `LOG_LEVEL`                  | `debug`                                                         |
| `VERIFYAX_BASE_URL`          | `https://webapp.dev.conscium.ai/api/v1`                         |
| `VERIFYAX_WEB_BASE_URL`      | `https://webapp.dev.conscium.ai/web/api/v1`                     |
| `HEALTH_URL`                 | `https://verifyax-mcp.dev.neo.conscium.ai/health`               |

**Environment `prod`**

| Variable                     | Value                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`             | `verifyax-prod`                                                                    |
| `GKE_CLUSTER`                | `verifyax-prod`                                                                    |
| `GKE_REGION`                 | `europe-west2`                                                                     |
| `WORKLOAD_IDENTITY_PROVIDER` | _(same as dev)_                                                                    |
| `SERVICE_ACCOUNT_EMAIL`      | `github-actions-deployer@verifyax-core.iam.gserviceaccount.com`                    |
| `ALLOWED_HOSTS`              | `mcp.verifyax.com,verifyax-mcp.prod.conscium.ai,verifyax-mcp.prod.neo.conscium.ai` |
| `LOG_LEVEL`                  | `info`                                                                             |
| `VERIFYAX_BASE_URL`          | `https://console.verifyax.com/api/v1`                                              |
| `VERIFYAX_WEB_BASE_URL`      | `https://console.verifyax.com/web/api/v1`                                          |
| `HEALTH_URL`                 | `https://verifyax-mcp.prod.neo.conscium.ai/health`                                 |

Resolve `WORKLOAD_IDENTITY_PROVIDER`:

```bash
gcloud iam workload-identity-pools providers describe github-actions-provider \
  --project=verifyax-core \
  --location=global \
  --workload-identity-pool=github-actions-workpool \
  --format='value(name)'
```

### Set variables with `gh`

```bash
REPO=verifyax/verifyax-mcp
WIF='projects/123456789/locations/global/workloadIdentityPools/github-actions-workpool/providers/github-actions-provider'  # replace

set_env() {
  local env="$1" name="$2" value="$3"
  gh variable set "$name" --env "$env" --body "$value" -R "$REPO"
}

# --- dev (example; use canonical table above) ---
set_env dev GCP_PROJECT_ID verifyax-dev
set_env dev GKE_CLUSTER verifyax-dev
set_env dev GKE_REGION europe-west2
set_env dev WORKLOAD_IDENTITY_PROVIDER "$WIF"
set_env dev SERVICE_ACCOUNT_EMAIL github-actions-deployer@verifyax-core.iam.gserviceaccount.com
set_env dev ALLOWED_HOSTS 'verifyax-mcp.dev.conscium.ai,verifyax-mcp.dev.neo.conscium.ai'
set_env dev LOG_LEVEL debug
set_env dev VERIFYAX_BASE_URL 'https://webapp.dev.conscium.ai/api/v1'
set_env dev VERIFYAX_WEB_BASE_URL 'https://webapp.dev.conscium.ai/web/api/v1'
set_env dev HEALTH_URL 'https://verifyax-mcp.dev.neo.conscium.ai/health'

# --- prod ---
set_env prod GCP_PROJECT_ID verifyax-prod
set_env prod GKE_CLUSTER verifyax-prod
set_env prod GKE_REGION europe-west2
set_env prod WORKLOAD_IDENTITY_PROVIDER "$WIF"
set_env prod SERVICE_ACCOUNT_EMAIL github-actions-deployer@verifyax-core.iam.gserviceaccount.com
set_env prod ALLOWED_HOSTS 'mcp.verifyax.com,verifyax-mcp.prod.conscium.ai,verifyax-mcp.prod.neo.conscium.ai'
set_env prod LOG_LEVEL info
set_env prod VERIFYAX_BASE_URL 'https://console.verifyax.com/api/v1'
set_env prod VERIFYAX_WEB_BASE_URL 'https://console.verifyax.com/web/api/v1'
set_env prod HEALTH_URL 'https://verifyax-mcp.prod.neo.conscium.ai/health'
```

List and audit:

```bash
gh variable list --env dev  -R verifyax/verifyax-mcp
gh variable list --env prod -R verifyax/verifyax-mcp
```

Expect **10** variables per environment.

---

## Workload Identity (GCP)

Deploy jobs use [google-github-actions/auth](https://github.com/google-github-actions/auth) with `WORKLOAD_IDENTITY_PROVIDER` and `SERVICE_ACCOUNT_EMAIL`.

Neo core Terraform today wires GitHub OIDC to **`verifyax/verification` only** (`git_repository` in verification `infra/GCP-NEO/environments/core/main.tf`, module `github`). Until **`verifyax/verifyax-mcp`** is trusted, deploy workflows fail at **Authenticate to Google Cloud** even when all variables are set.

**Infra change (verification repo, separate PR):**

1. Allow both repositories on the OIDC provider (`attribute_condition`), e.g. `assertion.repository in ['verifyax/verification', 'verifyax/verifyax-mcp']`, or add a second `workloadIdentityUser` binding for `principalSet://.../attribute.repository/verifyax/verifyax-mcp`.
2. `terraform apply` in `environments/core` (or your documented core path).

**Already granted to the deployer SA:** `roles/container.developer` on Neo projects; Artifact Registry push to `europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker` via `roles/artifactregistry.repoAdmin` on that repository.

---

## Workflows (what uses these variables)

| Workflow                                                                | Environment | Uses Neo variables?                                  |
| ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| [Deploy Neo MCP (dev)](../../.github/workflows/deploy-neo-dev.yml)      | `dev`       | Yes — all ten                                        |
| [Deploy Neo MCP (prod)](../../.github/workflows/deploy-neo-prod.yml)    | `prod`      | Yes — all ten                                        |
| [CI](../../.github/workflows/ci.yml)                                    | —           | No (runs `check-values.sh` with synthetic URLs only) |
| [Publish](../../.github/workflows/publish.yml)                          | —           | No                                                   |
| [Publish to MCP Registry](../../.github/workflows/publish-registry.yml) | —           | No                                                   |

### Dev deploy triggers

After **CI** succeeds:

- **Push** to **`dev`** — deploy only if the CI commit is still the **`dev`** tip (`stale_dev_tip` otherwise).
- **Pull request** into **`dev`** — same-repo PRs only (fork PRs run CI but do not deploy).

`select` job skip reasons: `stale_dev_tip`, `not_dev_trigger`, `no_dev_branch`, `invalid_sha`.

### Prod deploy triggers

Manual **workflow_dispatch** with tag `vX.Y.Z` only. Requires existing GitHub Release and `@verifyax/mcp-server@X.Y.Z` on npm. Publishing to npm does **not** roll prod.

---

## Repository secrets (not used for Neo deploy)

| Secret              | Neo deploy? | Notes                                          |
| ------------------- | ----------- | ---------------------------------------------- |
| `VERIFYAX_TEST_KEY` | No          | Optional live integration tests                |
| `NPM_TOKEN`         | No          | **Publish** uses npm Trusted Publishing (OIDC) |

No GitHub secret is required for the hosted MCP process; end users supply their own VerifyAX API keys.

---

## Local operator mirror

For `rollout.sh` outside Actions, copy the same exports into gitignored files:

- `deploy/neo/local/dev.env`
- `deploy/neo/local/prod.env`

See [local/README.md](local/README.md). Use `./deploy/neo/rollout.sh <dev|prod> --plan` to validate env without pushing.

---

## Troubleshooting

| Symptom                                                        | Likely cause                                  | What to do                                                                                |
| -------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Google auth step fails                                         | WIF still trusts only `verifyax/verification` | Complete WIF infra change; confirm provider resource name in `WORKLOAD_IDENTITY_PROVIDER` |
| `error: ALLOWED_HOSTS is not set` (or other env)               | Missing or misnamed GitHub variable           | `gh variable list --env <env>`; names must match exactly                                  |
| Dev deploy skipped: `stale_dev_tip`                            | Newer commit on `dev` before deploy ran       | Normal; latest push will deploy                                                           |
| Dev deploy skipped: `not_dev_trigger`                          | CI was for `main` or non-qualifying PR        | Expected                                                                                  |
| `dev rollout requires LOG_LEVEL=debug`                         | Wrong `LOG_LEVEL` on dev environment          | Set `debug` on **dev**, `info` on **prod**                                                |
| `dev VERIFYAX_* URLs must not point at the production console` | Dev vars point at `console.verifyax.com`      | Fix dev gateway URLs                                                                      |
| Health check timeout                                           | Wrong `HEALTH_URL`, ingress, or bad rollout   | Check URL in browser; `kubectl -n verifyax-mcp-<env> get deploy,pods`                     |
| Image push denied                                              | Registry IAM                                  | Confirm deployer SA `artifactregistry.repoAdmin` on `verifyax-docker`                     |
| Terraform apply reverted image/env                             | `image_tag` in verification values            | Re-run deploy workflow or `rollout.sh`; see README § Terraform drift                      |

---

## Go-live checklist

- [ ] Neo workflows on **`main`**
- [ ] Environments **`dev`** and **`prod`** exist; **prod** has reviewers
- [ ] Ten variables set on **dev** and **prod** (`gh variable list` × 2)
- [ ] WIF trusts **`verifyax/verifyax-mcp`**
- [ ] Branch **`dev`** exists; CI runs on push/PR to **`dev`**
- [ ] Dev: push or PR → CI green → **Deploy Neo MCP (dev)** succeeds; `HEALTH_URL` returns `{"status":"ok"}`
- [ ] Release on **`main`** → **Publish** → registry (if applicable)
- [ ] Prod: manual deploy with `vX.Y.Z` after npm + Release exist
