# Releasing

How to cut a new version of `@verifyax/sdk` and `@verifyax/mcp-server`. Both packages are
versioned in lockstep; every release ships them together at the same semver.

Merging a **version bump** to `main` publishes to npm automatically after CI passes (unless that
version is already on npm). Manual **Publish** workflow dispatch remains for dry-run rehearsal and
recovery. **Production Neo GKE** deploy is separate and manual — see
[deploy/neo/README.md](../deploy/neo/README.md).

Hosted **dev** MCP on Neo GKE deploys from the long-lived **`dev`** branch (see the same runbook).
Integration work merges to `dev` first; release PRs target `main`.

## Prerequisites

- Maintainer access to the `@verifyax` npm org.
- npm Trusted Publishing configured for both packages and `.github/workflows/publish.yml`.
- `VERIFYAX_TEST_KEY` and `VERIFYAX_TEST_AGENT_URL` configured so the complete live pipeline runs
  on pushes to `main` and on release tags.

## Overview

```
Feature PR → merge to dev → CI green → Neo dev MCP deploy (automatic)
Release PR: bump version + CHANGELOG + verify locally
  → merge to main → CI green
  → Publish workflow (automatic) → npm + git tag vX.Y.Z + GitHub Release
  → MCP Registry (after Publish uploads neo-release)
  → smoke test published packages
  → Deploy Neo MCP (prod) — manual workflow_dispatch when ready
```

## 1. Prepare the release (in your PR)

Do this on the feature branch **before** merging, so `main` is release-ready the moment the PR
lands.

### Bump the version

Set the new version in every hand-maintained location (they must all agree — `pnpm check:versions`
enforces this):

| File                               | Field(s)                           |
| ---------------------------------- | ---------------------------------- |
| `packages/sdk/package.json`        | `version`                          |
| `packages/mcp-server/package.json` | `version`                          |
| `server.json`                      | `version` and `packages[].version` |

The generated `packages/*/src/version.ts` files are **not** edited by hand. Run `pnpm build` (or
`node scripts/gen-version.mjs`) after bumping `package.json` to regenerate them.

**Tag vs npm version:** git tags use a `v` prefix (`v0.3.1`); npm `package.json` versions do not
(`0.3.1`).

### Finalize the changelog

In `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/) format):

1. Move everything under `[Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section.
2. Add a one-line summary at the top of that section (see prior releases for tone).
3. Leave an empty `[Unreleased]` section at the top for the next cycle.
4. Update the compare links at the bottom of the file:
   - `[Unreleased]: …/compare/vX.Y.Z...HEAD`
   - `[X.Y.Z]: …/compare/vPREVIOUS...vX.Y.Z`

Use semver consciously:

- **Patch** — bug fixes, internal resilience, doc-only MCP tool tweaks with no contract change.
- **Minor** — new tool inputs/outputs, new SDK surface, additive behavior.
- **Major** (pre-1.0: bump minor with a `### Breaking` section) — intentional contract breaks.

### Verify locally

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check:versions
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:conformance
```

Commit the version bump, changelog, and regenerated `version.ts` files in the PR.

## 2. Merge and wait for CI

Merge the PR to `main`. The CI workflow (`.github/workflows/ci.yml`) runs on every push to
`main`:

- Version consistency check
- Generated SDK artifact drift check (`pnpm gen:types`, `pnpm gen:spec-meta`)
- Lint, format, build
- Unit tests with coverage thresholds
- MCP conformance test (spawns the built server)
- Production dependency audit
- Integration tests against the live API; missing key or agent fixture fails this protected gate

Wait for this workflow to finish green. The **Publish** workflow runs automatically on that push
when the bumped version is not already on npm.

Pushing a `v*` tag still triggers CI (tag builds assert `pnpm check:versions` against the tag).
You do **not** need to push a tag before the automatic publish — the Publish workflow creates
`vX.Y.Z` after a successful npm upload.

## 3. Publish to npm (automatic on main)

After a green CI run on `main`, **Publish** (`.github/workflows/publish.yml`) checks whether
`@verifyax/mcp-server@X.Y.Z` is already on npm. If not, it reruns the deterministic test gate,
publishes both packages, creates the `vX.Y.Z` git tag, and opens the GitHub Release.

If npm already has the version but the GitHub Release is missing, Publish creates the release only
(no republish).

### Manual dispatch (dry-run or recovery)

Use the **Publish** workflow from the GitHub Actions tab when rehearsing or recovering. Enter the
immutable `vX.Y.Z` tag that already exists on the commit you want. Manual dispatch refuses to
continue unless CI passed for that exact tagged commit, then reruns the full suite before publishing.

### Dry run first

1. Actions → **Publish** → **Run workflow**
2. Enter `tag`: `vX.Y.Z`
3. Leave `dry_run`: **true** (default)

This builds, runs the full test gate, and runs `pnpm -r publish --dry-run` — no upload.

### Real publish

1. Run the same tag through the workflow with `dry_run`: **false**

This publishes both packages with provenance:

- `@verifyax/sdk@X.Y.Z`
- `@verifyax/mcp-server@X.Y.Z`

The MCP server's `workspace:*` dependency on the SDK is rewritten to the concrete version at
publish time. After npm succeeds, the workflow creates the GitHub Release and uploads a
`neo-release` artifact. **Publish to MCP Registry** runs from that Publish success (a release
created with `GITHUB_TOKEN` does not reliably start other workflows).

### Local publish (alternative)

Maintainers can publish from a clean checkout instead of the workflow:

```bash
pnpm install --frozen-lockfile
pnpm check:versions
pnpm build
pnpm test:coverage
pnpm test:conformance
pnpm -r publish --access public --no-git-checks --provenance
```

Requires a logged-in npm session or `NODE_AUTH_TOKEN`. Prefer the GitHub Actions workflow when
possible — it is the documented gate.

## 4. GitHub Release

The Publish workflow creates the `vX.Y.Z` GitHub Release only after both npm packages publish
successfully (automatic main path or manual dispatch with `dry_run: false`). Do not create it ahead
of the npm publish.

## 5. MCP Registry

**Automated.** The [`Publish to MCP Registry`](../.github/workflows/publish-registry.yml) workflow
publishes `server.json` to the official registry via **GitHub OIDC** — no local `mcp-publisher`
binary, PAT, or personal-account org authorization (the org-authorized OIDC identity is what makes
the `io.github.verifyax/*` namespace publishable; a personal account 403s, which is why 0.3.0/0.3.1
were skipped).

It runs automatically after a **successful Publish** run that uploaded `neo-release`, and still runs
on `release: published` for compatibility. The registry requires the npm package to exist first.
Confirm the run is green in the Actions tab.

**Manual catch-up / recovery.** If a release's registry publish was skipped or failed, run the
workflow from **Actions → Publish to MCP Registry → Run workflow**, selecting the release tag. It
verifies `server.json` matches a published npm version before publishing, so it fails fast (clear
message) if run too early.

The registry lists `@verifyax/mcp-server` under the `io.github.verifyax` namespace; its version must
match what shipped to npm (`server.json` `.version` == `packages/mcp-server/package.json` `.version`).

## 6. Deploy Neo MCP (prod, manual)

Publishing does **not** roll out production GKE. When you want prod live, run **Deploy Neo MCP
(prod)** with `vX.Y.Z` after npm and the GitHub Release exist. See
[deploy/neo/README.md](../deploy/neo/README.md).

## 7. Smoke test

Confirm the published artifact works outside the dev tree. The package ships two binaries
(`verifyax-mcp-server` for stdio, `verifyax-mcp-server-http` for HTTP), so `npx` needs the
explicit command name:

```bash
# stdio — exits immediately with an auth error without VERIFYAX_API_KEY; that confirms install + launch
VERIFYAX_API_KEY=test npx -y -p @verifyax/mcp-server@X.Y.Z verifyax-mcp-server

# confirm the SDK tarball landed too
npm view @verifyax/sdk@X.Y.Z version
```

For interactive tool calls, see [debugging-mcp-inspector.md](./debugging-mcp-inspector.md) and
point Inspector at the published package instead of a local build.

## Checklist

Copy for each release (replace `X.Y.Z`):

```
[ ] Bump version in both package.json files + server.json
[ ] Finalize CHANGELOG.md ([Unreleased] → [X.Y.Z])
[ ] pnpm build && pnpm check:versions
[ ] pnpm lint && pnpm format:check && pnpm test:coverage && pnpm test:conformance
[ ] Merge release PR → main CI green
[ ] Confirm Publish (auto) succeeded: npm, tag vX.Y.Z, GitHub Release
[ ] (Optional recovery) Actions: Publish manual dispatch with dry_run=false on vX.Y.Z
[ ] Confirm "Publish to MCP Registry" Actions run is green (registry shows the new version)
[ ] Actions: Deploy Neo MCP (prod) with tag vX.Y.Z when prod should roll
[ ] Smoke test: `npx -y -p @verifyax/mcp-server@X.Y.Z verifyax-mcp-server` and `npm view @verifyax/sdk@X.Y.Z version`
```

## Troubleshooting

### `check:versions` reports a mismatch

One of the hand-maintained version fields drifted. Run `pnpm check:versions` to see which file
disagrees, fix it, then `pnpm build` to regenerate `version.ts`.

### Tag CI fails: tag does not match package version

The git tag (`v0.3.1`) must match `package.json` (`0.3.1`). Amend the version bump commit on
`main` or retag after fixing — do not publish a mismatched set.

### Publish workflow fails on npm auth (E404 on PUT)

npm returns `404 Not Found` (not `403`) when OIDC trusted publishing auth fails — the package
exists, but the runner could not authenticate.

1. **npm CLI version.** Trusted publishing requires **npm >= 11.5.1**. Node 22 ships npm 10, which
   silently skips the OIDC exchange and fails with E404. The Publish workflow pins Node 24 for
   this reason; local publishes need `npm install -g npm@latest` (or Node 24+) before
   `pnpm -r publish`.
2. **Trusted publisher config.** On npmjs.com → each package → Settings → Trusted publishing,
   confirm `verifyax` / `verifyax-mcp` / `publish.yml` (filename only, case-sensitive). If the
   connection was created after 2026-09-03, ensure **npm publish** is allowed (not only
   `npm stage publish`).
3. **Workflow file on the tag.** `workflow_dispatch` runs the workflow **from the tagged commit**.
   If you fixed `publish.yml` on `main` after tagging, merge the fix and either retag or cut a
   new patch release before re-running Publish.

Do not add a long-lived `NPM_TOKEN` — the account requires 2FA for token writes (EOTP).

### Integration tests fail on `main` after merge

Fix forward on `main` before expecting auto-publish. Manual Publish dispatch still requires a
successful CI run for the exact tagged commit.
