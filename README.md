# VerifyAX MCP

Conversational access to the [VerifyAX](https://verifyax.com) agent-evaluation platform, plus
the typed SDK it is built on. Two packages in one pnpm monorepo:

| Package                                       | Description                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| [`@verifyax/sdk`](packages/sdk)               | Typed TypeScript client for the VerifyAX REST API. Reusable by any consumer.     |
| [`@verifyax/mcp-server`](packages/mcp-server) | MCP server exposing ~12 VerifyAX tools mapped to user intents. Built on the SDK. |

This complements (does not replace) the [`verifyax-api` skill](https://github.com/verifyax/claude-plugins):
the skill is for developers writing code; the MCP server is for conversational workflows.

## Status

Early development. See [`PLAN.md`](PLAN.md) for the phased execution plan and
[`CLAUDE.md`](CLAUDE.md) for project context and architecture decisions.

## Development

Requires Node ≥ 20 and [pnpm](https://pnpm.io) 10.

```bash
pnpm install      # install workspace dependencies
pnpm build        # build all packages (topological order)
pnpm typecheck    # type-check without emitting
pnpm test         # run unit tests
pnpm lint         # lint
pnpm format       # format with prettier
```

## Privacy

The MCP server sends **no telemetry**. It talks only to the VerifyAX API using the key you
provide via `VERIFYAX_API_KEY`.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
