# VerifyAX MCP

Conversational access to the [VerifyAX](https://verifyax.com) agent-evaluation platform, plus
the typed SDK it is built on. Two packages in one pnpm monorepo:

| Package                                       | Description                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@verifyax/sdk`](packages/sdk)               | Typed TypeScript client for the VerifyAX REST API. Reusable by any consumer.    |
| [`@verifyax/mcp-server`](packages/mcp-server) | MCP server exposing 12 VerifyAX tools mapped to user intents. Built on the SDK. |

This complements (does not replace) the [`verifyax-api` skill](https://github.com/verifyax/verifyax-plugins):
the skill is for developers writing code; the MCP server is for conversational workflows.

## Install the MCP server

Requires Node ≥ 20 and a VerifyAX API key (Settings → API Keys in the
[console](https://console.verifyax.com)).

**Claude Code:**

```bash
claude mcp add verifyax --env VERIFYAX_API_KEY=sk-ver-api-... -- npx -y @verifyax/mcp-server
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verifyax": {
      "command": "npx",
      "args": ["-y", "@verifyax/mcp-server"],
      "env": { "VERIFYAX_API_KEY": "sk-ver-api-..." }
    }
  }
}
```

Restart the client, then describe what you want. See
[`packages/mcp-server`](packages/mcp-server) for the full tool list and configuration.

## What you can ask

Once installed, just describe the task — Claude picks the tool:

- _“List the skill tags I can use for an interview scenario on VerifyAX.”_
- _“Register the A2A agent at https://my-agent.example.com and run a quick interview eval.”_
- _“Generate an info_exchange scenario tagged empathy and coordination, then show me the scores.”_
- _“What did my last 5 simulation runs cost?”_

Blocking tools (`generate_scenario`, `evaluate_agent`) poll internally and return only when the
work completes (typically 30s–5min) — no manual status checks.

## Troubleshooting

- **“VERIFYAX_API_KEY is not set”** — the key isn’t reaching the server. Check the `env` block in
  your MCP client config.
- **Authentication failed** — the key is invalid, revoked, or from the wrong environment. Mint a
  fresh one in the console.
- **Tool calls don’t appear** — MCP clients load tools at startup; restart the client (or start a
  new session) after adding the server.
- **Want logs?** Set `VERIFYAX_MCP_LOG_LEVEL=debug`. Logs are structured JSON on stderr; stdout is
  reserved for the MCP protocol.

## Status

See [`PLAN.md`](PLAN.md) for the phased execution plan and [`CLAUDE.md`](CLAUDE.md) for project
context and architecture decisions. Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Development

Requires Node ≥ 20 and [pnpm](https://pnpm.io) 10.

```bash
pnpm install      # install workspace dependencies
pnpm build        # build all packages (topological order)
pnpm test         # run unit tests
pnpm lint         # lint
pnpm format       # format with prettier
```

Network-dependent suites: `pnpm test:integration` (live API, needs `VERIFYAX_TEST_KEY`) and
`pnpm test:conformance` (spawns the built MCP server over stdio).

## Privacy

The MCP server sends **no telemetry**. It talks only to the VerifyAX API using the key you
provide via `VERIFYAX_API_KEY`.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
