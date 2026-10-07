# Local Neo rollout environment files

Gitignored `dev.env` / `prod.env` in this directory supply the variables that GitHub Actions
reads from **Environment** configuration. Copy the variable names from
[github-setup.md](../github-setup.md) and paste values from the private **verification** repo
(`infra/GCP-NEO/applications/verifyax-mcp/values-<env>.yaml` for hosts and log level, plus the
gateway URLs your operators use for that environment).

Example shape (`dev.env` — replace placeholders):

```bash
export GCP_PROJECT_ID='…'
export GKE_CLUSTER='…'
export GKE_REGION='europe-west2'
export ALLOWED_HOSTS='host1,host2'
export LOG_LEVEL='debug'
export VERIFYAX_BASE_URL='https://…/api/v1'
export VERIFYAX_WEB_BASE_URL='https://…/web/api/v1'
export HEALTH_URL='https://…/health'
```

Then run `./deploy/neo/rollout.sh dev` from the repo root (the script sources `deploy/neo/local/dev.env` automatically).
