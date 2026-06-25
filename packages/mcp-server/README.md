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

The full v1 catalogue of 12 tools:

| Tool                   | Description                                                                      | Blocking |
| ---------------------- | -------------------------------------------------------------------------------- | -------- |
| `list_compatible_tags` | Lists skill tags usable for a given scenario type (`info_exchange`/`interview`). | no       |
| `register_agent`       | Registers an agent (A2A or API); verifies the A2A card before creating.          | no       |
| `list_agents`          | Lists registered agents, optionally filtered by type.                            | no       |
| `delete_agent`         | Permanently deletes an agent by uuid.                                            | no       |
| `generate_scenario`    | Generates a scenario and waits for it to finish.                                 | **yes**  |
| `list_scenarios`       | Lists scenarios, optionally filtered by type/status.                             | no       |
| `delete_scenario`      | Permanently deletes a scenario by uuid.                                          | no       |
| `evaluate_agent`       | Runs an agent against a scenario and returns the evaluation, end to end.         | **yes**  |
| `list_recent_runs`     | Lists recent simulation runs, optionally filtered.                               | no       |
| `get_run_details`      | Fetches a run plus its evaluation when available.                                | no       |
| `get_usage_summary`    | Summarizes usage events (counts by area, total credits).                         | no       |
| `preview_run_cost`     | Estimates the credit cost of a run before triggering it.                         | no       |

Blocking tools poll internally and return only when the work completes (typically 30s–5min).

## Privacy

No telemetry. The server talks only to the VerifyAX API using your key. Logs are written to
stderr and stay on your machine.

## License

Apache-2.0.
