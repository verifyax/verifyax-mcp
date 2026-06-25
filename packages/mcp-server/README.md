# @verifyax/mcp-server

An [MCP](https://modelcontextprotocol.io) server that exposes the
[VerifyAX](https://verifyax.com) agent-evaluation platform as conversational tools, so you can
register agents, generate scenarios, run simulations, and read evaluations by just describing
what you want.

Built on [`@verifyax/sdk`](../sdk). For developers who want to script the API directly, use the
SDK or the [`verifyax-api` skill](https://github.com/verifyax/claude-plugins) instead.

## Requirements

- Node ≥ 20
- A VerifyAX API key (Settings → API Keys in the [console](https://console.verifyax.com))

## Install

```bash
npm install -g @verifyax/mcp-server
```

The package exposes a `verifyax-mcp-server` binary that speaks MCP over stdio.

## Configure your MCP client

### Claude Code

```bash
claude mcp add verifyax --env VERIFYAX_API_KEY=sk-ver-api-... -- npx -y @verifyax/mcp-server
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

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

Restart the client, then try: _“List the skill tags I can use for an interview scenario.”_

## Configuration

| Env var                  | Required | Description                                                                      |
| ------------------------ | -------- | -------------------------------------------------------------------------------- |
| `VERIFYAX_API_KEY`       | yes      | Your VerifyAX API key.                                                           |
| `VERIFYAX_MCP_LOG_LEVEL` | no       | `debug` \| `info` (default) \| `warn` \| `error` \| `silent`. Logs go to stderr. |
| `VERIFYAX_BASE_URL`      | no       | Override the API base (self-hosting / testing).                                  |
| `VERIFYAX_WEB_BASE_URL`  | no       | Override the tag-catalogue base.                                                 |

## Tools

Phase 2 ships the first tool; the rest follow in Phase 3 (see [PLAN.md](../../PLAN.md)).

| Tool                   | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `list_compatible_tags` | Lists skill tags usable for a given scenario type (`info_exchange`/`interview`). |

## Privacy

No telemetry. The server talks only to the VerifyAX API using your key. Logs are written to
stderr and stay on your machine.

## License

Apache-2.0.
