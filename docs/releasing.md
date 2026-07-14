# Releasing

How to cut a new version of `@verifyax/sdk` and `@verifyax/mcp-server`. Both packages are
versioned in lockstep; every release ships them together at the same semver.

Publishing is **manual** (opt-in via GitHub Actions). Merging to `main` does not publish to npm
by itself.

## Prerequisites

- Maintainer access to the `@verifyax` npm org and the repo's GitHub Actions secrets.
- `NPM_TOKEN` configured as a repository secret (automation token with publish access).
- `VERIFYAX_TEST_KEY` configured so integration tests run on pushes to `main` and on release tags.

## Overview

```
PR: bump version + CHANGELOG + verify locally
  → merge to main → CI green
  → tag vX.Y.Z on main → CI verifies tag matches package version
  → Publish workflow (dry run, then real)
  → GitHub Release + MCP registry (if server.json changed)
  → smoke test published packages
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
- Integration tests against the live API (when `VERIFYAX_TEST_KEY` is set)

Do not tag until this workflow is green.

## 3. Tag the release

From an up-to-date `main`:

```bash
git checkout main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

Pushing a `v*` tag triggers CI again. On tag builds, `pnpm check:versions` also asserts the tag
name matches the package version (`EXPECT_VERSION` in the workflow).

## 4. Publish to npm

Use the **Publish** workflow (`.github/workflows/publish.yml`) from the GitHub Actions tab. Run
it against `main` at the tagged commit.

### Dry run first

1. Actions → **Publish** → **Run workflow**
2. Branch: `main`
3. `dry_run`: **true** (default)

This builds, runs the full test gate, and runs `pnpm -r publish --dry-run` — no upload.

### Real publish

1. Run the same workflow with `dry_run`: **false**

This publishes both packages with provenance:

- `@verifyax/sdk@X.Y.Z`
- `@verifyax/mcp-server@X.Y.Z`

The MCP server's `workspace:*` dependency on the SDK is rewritten to the concrete version at
publish time.

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

## 5. GitHub Release

Create a release from the `vX.Y.Z` tag:

- **Title:** `vX.Y.Z`
- **Body:** paste the `[X.Y.Z]` section from `CHANGELOG.md`

## 6. MCP Registry

If `server.json` changed (version bump always does), update the official MCP registry entry
after npm publish succeeds. Use the `mcp-publisher` CLI from the repo root against the updated
`server.json` (see the [MCP registry docs](https://github.com/modelcontextprotocol/registry)).

The registry lists `@verifyax/mcp-server` under the `io.github.verifyax` namespace; its version
must match what shipped to npm.

## 7. Smoke test

Confirm the published artifact works outside the dev tree:

```bash
npx -y @verifyax/mcp-server@X.Y.Z --help
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
[ ] Merge PR → main CI green
[ ] git tag vX.Y.Z && git push origin vX.Y.Z → tag CI green
[ ] Actions: Publish (dry_run=true, then dry_run=false)
[ ] GitHub Release from tag (CHANGELOG body)
[ ] MCP registry publish (server.json)
[ ] Smoke test @verifyax/mcp-server@X.Y.Z and @verifyax/sdk@X.Y.Z
```

## Troubleshooting

### `check:versions` reports a mismatch

One of the hand-maintained version fields drifted. Run `pnpm check:versions` to see which file
disagrees, fix it, then `pnpm build` to regenerate `version.ts`.

### Tag CI fails: tag does not match package version

The git tag (`v0.3.1`) must match `package.json` (`0.3.1`). Amend the version bump commit on
`main` or retag after fixing — do not publish a mismatched set.

### Publish workflow fails on npm auth

Confirm `NPM_TOKEN` is present in repo secrets and has publish rights to `@verifyax/*`. The
workflow uses `--provenance`, which requires `id-token: write` (already set in the workflow).

### Integration tests fail on `main` after merge

Fix forward on `main` before tagging. The Publish workflow does not run integration tests, but
a red `main` usually means API drift — see `docs/verifyax-api.md` and the integration suite in
`packages/sdk/test/integration/`.
