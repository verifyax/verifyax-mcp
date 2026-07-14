# @verifyax/mcp-server

An [MCP](https://modelcontextprotocol.io) server that exposes the
[VerifyAX](https://verifyax.com) agent-evaluation platform as conversational tools, so you can
register agents, generate scenarios, run simulations, and read evaluations by just describing
what you want.

Built on [`@verifyax/sdk`](../sdk). For developers who want to script the API directly, use the
SDK or the [`verifyax-api` skill](https://github.com/verifyax/verifyax-plugins) instead.

## Requirements

- Node ≥ 20
- A VerifyAX API key (Settings → API Keys in the [console](https://console.verifyax.com))

## Install

```bash
npm install -g @verifyax/mcp-server
```

The package exposes two binaries:

- `verifyax-mcp-server` — MCP over **stdio** (local MCP clients; API key via env)
- `verifyax-mcp-server-http` — MCP over **Streamable HTTP** (remote deploy; API key from client headers)

## Configure your MCP client

### Claude Code (stdio — local)

```bash
claude mcp add verifyax --env VERIFYAX_API_KEY=sk-ver-api-... -- npx -y @verifyax/mcp-server
```

### Claude Desktop (stdio — local)

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

### Remote agent (Streamable HTTP — Cloud Run or local HTTP server)

**Option A — native URL (Cursor v0.48+):**

```json
{
  "mcpServers": {
    "verifyax": {
      "url": "https://your-service.run.app/mcp",
      "headers": {
        "Authorization": "Bearer sk-ver-api-..."
      }
    }
  }
}
```

Do **not** add a `transport` field — Cursor detects Streamable HTTP from the URL.

**Option B — `mcp-remote` bridge (works on all Cursor versions; same pattern as Tavily):**

```json
{
  "mcpServers": {
    "verifyax": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-service.run.app/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization:${VERIFYAX_AUTH}"
      ],
      "env": {
        "VERIFYAX_AUTH": "Bearer sk-ver-api-..."
      }
    }
  }
}
```

Use `--transport http-only` because this server speaks Streamable HTTP only (no legacy SSE).

You can also use `"X-VerifyAX-API-Key": "sk-ver-api-..."` instead of `Authorization`. The deployed server does not need `VERIFYAX_API_KEY` in its environment — each client supplies their own key.

See [`deploy/gcp/README.md`](../../deploy/gcp/README.md) for Cloud Run deployment.

Restart the client, then try: _“List the skill tags I can use for an interview scenario.”_

## Running locally

Build once: `pnpm build` from the monorepo root.

| Mode                | Command                                   | API key                                                |
| ------------------- | ----------------------------------------- | ------------------------------------------------------ |
| **stdio**           | `VERIFYAX_API_KEY=... node dist/index.js` | Server env (`VERIFYAX_API_KEY`)                        |
| **Streamable HTTP** | `node dist/http.js`                       | Client header on connect (`Authorization: Bearer ...`) |

HTTP server listens on `127.0.0.1:8080` by default (`HOST`, `PORT` override). Endpoints:

- Streamable HTTP: `POST/GET/DELETE /mcp`
- Health: `GET /health`

**MCP Inspector (stdio):**

```bash
npx @modelcontextprotocol/inspector \
  -e VERIFYAX_API_KEY=sk-ver-api-... \
  node packages/mcp-server/dist/index.js
```

**MCP Inspector (Streamable HTTP)** — start the HTTP server, then connect with your API key in the Authorization header.

## Configuration

| Env var                      | Required   | Description                                                                              |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `VERIFYAX_API_KEY`           | stdio only | Your VerifyAX API key for the stdio entry point.                                         |
| `VERIFYAX_MCP_LOG_LEVEL`     | no         | `debug` \| `info` (default) \| `warn` \| `error` \| `silent`. Logs go to stderr.         |
| `VERIFYAX_BASE_URL`          | no         | Override the API base (self-hosting / testing).                                          |
| `VERIFYAX_WEB_BASE_URL`      | no         | Override the tag-catalogue base.                                                         |
| `HOST`                       | no         | Bind address for HTTP server (default `127.0.0.1`; use `0.0.0.0` on Cloud Run).          |
| `PORT`                       | no         | HTTP port (default `8080`).                                                              |
| `VERIFYAX_MCP_ALLOWED_HOSTS` | no         | Comma-separated Host header allowlist (DNS rebinding protection when binding `0.0.0.0`). |

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
| `get_usage_summary`    | Summarizes usage events (counts by area, total USD spend).                       | no       |
| `preview_run_cost`     | Estimates the credit cost of a run before triggering it.                         | no       |

Blocking tools poll internally and return only when the work completes (typically 30s–5min).

## Privacy

No telemetry. The server talks only to the VerifyAX API using your key. Logs are written to
stderr and stay on your machine.

## License

Apache-2.0.
