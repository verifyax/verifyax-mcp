# Neo GKE — VerifyAX MCP (Streamable HTTP)

Hosted `@verifyax/mcp-server` on GCP Neo GKE. This path complements [Cloud Run deploy](../gcp/README.md); it does not replace local stdio or Cloud Run.

Terraform and Deployment manifests live in the private **verification** repo under `infra/GCP-NEO/applications/verifyax-mcp/`. This directory rolls the **existing** Deployment with `kubectl` — no `terraform apply` from this repo.

**Configuration:** Runtime hosts, gateway URLs, health check URL, and GCP cluster targeting are **GitHub Environment variables** (`dev` / `prod`), not files in this public repo. See [github-setup.md](github-setup.md). Local operators use gitignored `local/<dev|prod>.env` (see [local/README.md](local/README.md)).

## Branch and trigger flow

| Step        | Branch / action                                        | Outcome                                                          |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Integration | PR or push to **`dev`** (after CI passes)              | **Automatic** dev deploy (`deploy-neo-dev` workflow)             |
| Release     | Version-bump PR merged to **`main`** (after CI passes) | **Automatic** npm publish + GitHub Release (`Publish` workflow)  |
| Registry    | After a real Publish run                               | **Automatic** MCP Registry publish (`publish-registry` workflow) |
| Production  | **Manual** — Actions → **Deploy Neo MCP (prod)**       | Prod image build + GKE rollout                                   |

Create a long-lived **`dev`** branch from `main` after automation is on `main`. Feature work merges to `dev` first for hosted dev MCP; release PRs bump semver and merge to `main`.

`main` pushes alone do **not** deploy dev. Release publish does **not** deploy prod.

## Image tags

| Environment | Tag pattern                                       | Example       |
| ----------- | ------------------------------------------------- | ------------- |
| Dev         | `dev-<7-char git sha>`                            | `dev-ae9d04d` |
| Prod        | Plain semver = `packages/mcp-server/package.json` | `0.4.0`       |

Registry: `europe-west2-docker.pkg.dev/verifyax-core/verifyax-docker/verifyax-mcp:<tag>`

Images are built from [`deploy/gcp/Dockerfile`](../gcp/Dockerfile). Verification’s `build-push.sh` installs npm `@verifyax/mcp-server@<version>` instead — use this repo’s workflows for Neo rollouts.

Never deploy `:latest`.

## Runtime settings

`rollout.sh` patches the live Deployment with:

- `VERIFYAX_MCP_LOG_LEVEL` from `LOG_LEVEL`
- `VERIFYAX_MCP_ALLOWED_HOSTS` from `ALLOWED_HOSTS` plus `$(POD_IP)`
- `VERIFYAX_BASE_URL` / `VERIFYAX_WEB_BASE_URL`

Namespace and Deployment name are always `verifyax-mcp-<dev|prod>`. Replicas stay **1** and strategy **Recreate** (Terraform); do not scale out until session state is externalized.

## Local rollout (operators)

Prerequisites: `docker`, `gcloud`, `kubectl`, registry push access, and a filled `deploy/neo/local/dev.env` or `prod.env`.

```bash
gcloud auth login
gcloud auth configure-docker europe-west2-docker.pkg.dev

./deploy/neo/rollout.sh dev --plan   # verify env
./deploy/neo/rollout.sh dev

git checkout vX.Y.Z
./deploy/neo/rollout.sh prod
```

## GitHub Actions setup

Full variable list and WIF prerequisites: [github-setup.md](github-setup.md).

| Workflow                                                                               | Trigger                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`.github/workflows/deploy-neo-dev.yml`](../../.github/workflows/deploy-neo-dev.yml)   | CI success on push to `dev` or same-repo PR into `dev`               |
| [`.github/workflows/deploy-neo-prod.yml`](../../.github/workflows/deploy-neo-prod.yml) | Manual `workflow_dispatch` with `vX.Y.Z`                             |
| [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)                 | CI success on push to `main` (version not on npm) or manual dispatch |

`workflow_run` workflows only run once their workflow file is on **`main`**.

## Rollback

**Prod (preferred):** Actions → **Deploy Neo MCP (prod)** → previous `vX.Y.Z`.

**Cluster:** `kubectl rollout undo -n verifyax-mcp-<env> deployment/verifyax-mcp-<env>`.

**Image:** Re-run `rollout.sh` with `IMAGE_TAG=<previous-tag>`.

## Terraform drift (verification repo)

When `image_tag` is set in verification values, Terraform owns the container image. A `terraform apply` can reset the image and remove env vars not in the Deployment template (including gateway URLs set by rollout). Re-run the deploy workflow or `rollout.sh` after such an apply.

## Dev PR behavior

One dev replica. A PR deploy replaces the current dev deployment until the next successful rollout. Stale **push** deploys are skipped when the commit is no longer the `dev` tip.
