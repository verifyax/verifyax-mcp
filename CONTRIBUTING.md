# Contributing

Thanks for your interest in improving the VerifyAX MCP server and SDK.

## Development setup

Requires Node ≥ 20 and [pnpm](https://pnpm.io) 10.

```bash
pnpm install     # install workspace dependencies
pnpm build       # build all packages (tsc -b, project references)
pnpm test        # unit tests (fast, no network)
pnpm lint        # eslint
pnpm format      # prettier --write
```

Optional, network-dependent suites:

```bash
pnpm test:integration   # SDK against the live API; skips without VERIFYAX_TEST_KEY
pnpm test:conformance    # spawns the built MCP server and drives it over stdio
```

## Project layout

- `packages/sdk` — `@verifyax/sdk`, the typed REST client. No MCP knowledge.
- `packages/mcp-server` — `@verifyax/mcp-server`, the MCP tools built on the SDK.
- `docs/verifyax-api.md` — the canonical API reference. Trust it; if the live API disagrees, fix
  the doc and add a test that asserts the real behavior.
- `docs/tool-descriptions.md` — reviewed tool descriptions (keep in sync with the tool files).

See `CLAUDE.md` for architecture decisions and conventions, and `PLAN.md` for the roadmap.

## Conventions

- TypeScript strict mode. No `any`; a type assertion needs a comment explaining why.
- Named exports only (no default exports). The lint config enforces both this and no `console`
  (logging goes through `logging.ts` → stderr).
- Errors are typed: throw from the `VerifyaxError` hierarchy in the SDK; in the server, catch and
  translate to structured `{ success: false, reason, suggested_fix }` tool results.
- One file per tool. Each exports a `createXHandler(ctx)` factory and a `registerX(server, ctx)`.
- Tests colocate by intent under `test/unit`, `test/integration`, `test/conformance`.

## Pull requests

- Keep diffs small and reviewable; decompose large changes.
- Include tests with the code, not afterwards.
- Ensure `pnpm lint`, `pnpm format:check`, `pnpm build`, and `pnpm test` pass. CI also runs the
  conformance suite and (on `main`/tags) the integration suite.
- Add a `CHANGELOG.md` entry for user-facing changes (Keep a Changelog format).
- Adding or changing a tool description? Update `docs/tool-descriptions.md` too.

## Adding a tool

1. Create `packages/mcp-server/src/tools/<tool-name>.ts` with a zod `inputSchema`, a
   `createXHandler(ctx)` factory using `runTool`, and a `registerX(server, ctx)`.
2. Register it in `src/tools/index.ts`.
3. Add unit tests in `test/unit` driving the handler against a stubbed context.
4. Document it in `docs/tool-descriptions.md` and the server README.
5. Update the conformance test's expected tool list.
