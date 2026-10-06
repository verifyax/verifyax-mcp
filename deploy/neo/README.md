# Neo GKE — VerifyAX MCP (Streamable HTTP)

Hosted `@verifyax/mcp-server` on GCP Neo GKE (`verifyax-dev` / `verifyax-prod`). This path complements [Cloud Run deploy](../gcp/README.md); it does not replace local stdio or Cloud Run.

Reference Terraform and manifests live in the **verification** repo under `infra/GCP-NEO/applications/verifyax-mcp/`. This directory mirrors runtime settings in `values-*.yaml` and rolls the **existing** Deployment with `kubectl` — no `terraform apply` from this repo.

## Branch and trigger flow

| Step        | Branch / action                                        | Outcome                                                          |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Integration | PR or push to **`dev`** (after CI passes)              | **Automatic** dev deploy (`deploy-neo-dev` workflow)             |
| Release     | Version-bump PR merged to **`main`** (after CI passes) | **Automatic** npm publish + GitHub Release (`Publish` workflow)  |
| Registry    | After a real Publish run                               | **Automatic** MCP Registry publish (`publish-registry` workflow) |
| Production  | **Manual** — Actions → **Deploy Neo MCP (prod)**       | Prod image build + GKE rollout                                   |

Create a long-lived **`dev`** branch from `main` after this automation is on `main`. Feature work merges to `dev` first for hosted dev MCP; release PRs bump semver and merge to `main`.

`main` pushes alone do **not** deploy dev. Release publish does **not** deploy prod.

## Image tags

| Environment | Tag pattern                                       | Example       |
| ----------- | ------------------------------------------------- | ------------- |
| Dev         | `dev-<7-char git sha>`                            | `dev-ae9d04d` |
| Prod        | Plain semver = `packages/mcp-server/package.json` | `0.4.0`       |

Registry: `europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:<tag>`

Images are built from [`deploy/gcp/Dockerfile`](../gcp/Dockerfile) (monorepo source). Verification’s `build-push.sh` installs npm `@verifyax/mcp-server@<version>` instead — use this repo’s workflows for Neo rollouts.

Never deploy `:latest`.

## Runtime settings (mirrored)

**Dev** (`values-dev.yaml`): `log_level=debug`, hosts `verifyax-mcp.dev.conscium.ai` and `verifyax-mcp.dev.neo.conscium.ai`, API via `https://webapp.dev.neo.conscium.ai` (`VERIFYAX_BASE_URL` / `VERIFYAX_WEB_BASE_URL`).

**Prod** (`values-prod.yaml`): `log_level=info`, hosts `mcp.verifyax.com` and prod neo/conscium aliases, API via `https://console.verifyax.com`.

Replicas stay **1** and rollout strategy **Recreate** (in-process MCP sessions). Do not scale out until session state is externalized.

Health checks after deploy:

- Dev: `https://verifyax-mcp.dev.neo.conscium.ai/health`
- Prod: `https://verifyax-mcp.prod.neo.conscium.ai/health`

Expect `{"status":"ok"}`.

## Local rollout (operators)

Prerequisites: `docker`, `gcloud`, `kubectl`, and permission to push to `verifyax-core` Artifact Registry and roll Deployments in the target cluster.

```bash
# Authenticate (human operator)
gcloud auth login
gcloud auth configure-docker europe-west2-docker.pkg.dev

# Dev — builds from current HEAD, tag dev-<sha>
./deploy/neo/rollout.sh dev

# Prod — checkout release tag first; tag must match package.json
git checkout vX.Y.Z
./deploy/neo/rollout.sh prod

# Dry-run: print image and env only
./deploy/neo/rollout.sh dev --plan
```

Override cluster targeting with `GCP_PROJECT_ID`, `GKE_CLUSTER`, and `GKE_REGION` when needed (defaults come from the values file).

## GitHub Actions setup

### Environments

Create **`dev`** and **`prod`** environments on `verifyax/verifyax-mcp`. Use **prod** protection (required reviewers) so production rollouts are explicit.

Per-environment **variables** (same names as verification deploy workflows):

| Variable                     | Dev                                                             | Prod            |
| ---------------------------- | --------------------------------------------------------------- | --------------- |
| `GCP_PROJECT_ID`             | `verifyax-dev`                                                  | `verifyax-prod` |
| `GKE_CLUSTER`                | `verifyax-dev`                                                  | `verifyax-prod` |
| `GKE_REGION`                 | `europe-west2`                                                  | `europe-west2`  |
| `WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name                                 | Same            |
| `SERVICE_ACCOUNT_EMAIL`      | `github-actions-deployer@verifyax-core.iam.gserviceaccount.com` | Same            |

Resolve `WORKLOAD_IDENTITY_PROVIDER`:

```bash
gcloud iam workload-identity-pools providers describe github-actions-provider \
  --project=verifyax-core \
  --location=global \
  --workload-identity-pool=github-actions-workpool \
  --format='value(name)'
```

### Workload Identity (prerequisite)

Neo core Terraform currently trusts **`verifyax/verification`** only (`git_repository` in `environments/core`). Until a separate infra change adds **`verifyax/verifyax-mcp`** to the WIF provider condition and `workloadIdentityUser` binding, deploy workflows fail at Google auth even with the variables above.

The deployer service account already has `roles/container.developer` on the Neo projects.

### Workflows

| Workflow                                                                               | Trigger                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`.github/workflows/deploy-neo-dev.yml`](../../.github/workflows/deploy-neo-dev.yml)   | CI success on push to `dev` or same-repo PR into `dev`               |
| [`.github/workflows/deploy-neo-prod.yml`](../../.github/workflows/deploy-neo-prod.yml) | Manual `workflow_dispatch` with `vX.Y.Z`                             |
| [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)                 | CI success on push to `main` (version not on npm) or manual dispatch |

`workflow_run` workflows only run once their workflow file is on **`main`**.

## Rollback

**Prod (preferred):** Actions → **Deploy Neo MCP (prod)** → run with the previous release tag `vX.Y.Z` (npm and GitHub Release must exist).

**Cluster:** `kubectl rollout undo -n verifyax-mcp-<env> deployment/verifyax-mcp-<env>` (brief downtime; `Recreate` strategy).

**Image:** Re-run `rollout.sh` with `IMAGE_TAG=<previous-tag>` after checking out the matching commit or release tag.

## Terraform drift (verification repo)

`verifyax-mcp` values files set `image_tag` (e.g. `0.3.7`). The manifest module keeps the Deployment image **Terraform-managed** when `image_tag` is present. A verification `terraform apply` can:

- Reset the container image to `image_tag` in `values-<env>.yaml`
- Remove env vars not in the Deployment template (including `VERIFYAX_BASE_URL` / `VERIFYAX_WEB_BASE_URL` set by this rollout)

After a Neo Terraform apply that touches verifyax-mcp, re-run the appropriate deploy workflow or `rollout.sh`. Syncing `image_tag` in verification is a separate ops step.

## Dev PR behavior

Only one dev replica exists. A successful deploy from an open PR replaces whatever is currently on dev until the next push to `dev` or another PR deploy wins the concurrency queue. Stale **push** deploys are skipped when the commit is no longer the `dev` branch tip.
