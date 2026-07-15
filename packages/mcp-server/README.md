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

#### Development testing

For testing the mcp server with the development VerifyAX env, you have to configure the development VERIFYAX_BASE_URL and VERIFYAX_WEB_BASE_URL environmentvariables

The mcp configuration should look like this:

```json
    {
       "mcpServers": {
         "verifyax": {
           "command": "npx",
           "args": ["-y", "@verifyax/mcp-server"],
           "env": {
             "VERIFYAX_API_KEY": "sk-ver-api-...",
             "VERIFYAX_BASE_URL": "https://dev-url.com/api/v1",
             "VERIFYAX_WEB_BASE_URL":
      "https://dev-url.com/web/api/v1"
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

All commands below are run from the monorepo root:

| Mode                | Command                                                       | API key                                                |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| **stdio**           | `VERIFYAX_API_KEY=... node packages/mcp-server/dist/index.js` | Server env (`VERIFYAX_API_KEY`)                        |
| **Streamable HTTP** | `pnpm --filter @verifyax/mcp-server start:dev`                | Client header on connect (`Authorization: Bearer ...`) |

HTTP server listens on `127.0.0.1:8080` by default (`HOST`, `PORT` override). Endpoints:

- Streamable HTTP: `POST/GET/DELETE /mcp`
- Health: `GET /health`

**MCP Inspector (stdio):**

First, ensure you have built the server by running `pnpm build` from the monorepo root.

To run the inspector against a specific environment, provide your `VERIFYAX_API_KEY` (in the shell or in the matching `.env.*` file). The `inspect*` scripts load that file with dotenv and forward `VERIFYAX_*` variables to Inspector via `-e` (required — Inspector does not pass your shell env to the spawned stdio server):

```bash
# Production — VERIFYAX_API_KEY from shell prefix or .env.prod
VERIFYAX_API_KEY=sk-ver-api-... pnpm --filter @verifyax/mcp-server inspect

# Development — base URLs from .env.dev
VERIFYAX_API_KEY=sk-ver-api-... pnpm --filter @verifyax/mcp-server inspect:dev

# Testing
VERIFYAX_API_KEY=sk-ver-api-... pnpm --filter @verifyax/mcp-server inspect:test
```

**MCP Inspector (Streamable HTTP)** — start the HTTP server in the desired environment (e.g., `pnpm --filter @verifyax/mcp-server start:dev`), then connect with your API key in the Authorization header.

## Environments

The published npm package is pre-configured to connect only to the production VerifyAX API (`console.verifyax.com`).

For local development and testing of new changes on the server, you can configure the server to run against different VerifyAX environments (e.g., development, testing) using `.env` files.

- `.env.dev`: For the development environment.
- `.env.test`: For the testing environment.
- `.env.prod`: For the production environment.

An `.env.example` file is provided to show the available configuration options. You can copy it to create your own `.env.*` files. These files are not committed to git and are not included in the published package.

The following scripts are available to run the server in different modes from the root of the project:

| Command                                         | Description                                |
| ----------------------------------------------- | ------------------------------------------ |
| `pnpm --filter @verifyax/mcp-server start`      | Starts the server in **production** mode.  |
| `pnpm --filter @verifyax/mcp-server start:dev`  | Starts the server in **development** mode. |
| `pnpm --filter @verifyax/mcp-server start:test` | Starts the server in **testing** mode.     |

These scripts use `scripts/run-with-env-file.mjs`, which refuses to start when a required `.env.*` file is missing or still points at production. `start:dev` / `start:test` / `inspect:dev` / `inspect:test` set `VERIFYAX_MCP_TARGET_ENV`, and the server aborts at startup if non-production base URLs are not configured.

## Configuration

| Env var                      | Required   | Description                                                                                                                                                         |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERIFYAX_API_KEY`           | stdio only | Your VerifyAX API key for the stdio entry point.                                                                                                                    |
| `VERIFYAX_MCP_LOG_LEVEL`     | no         | `debug` \| `info` (default) \| `warn` \| `error` \| `silent`. Logs go to stderr.                                                                                    |
| `VERIFYAX_BASE_URL`          | no         | Override the API base (for self-hosting/testing. Monorepo devs typically use convenience scripts).                                                                  |
| `VERIFYAX_WEB_BASE_URL`      | no         | Override the tag-catalogue base (for self-hosting/testing).                                                                                                         |
| `HOST`                       | no         | Bind address for HTTP server (default `127.0.0.1`; use `0.0.0.0` on Cloud Run).                                                                                     |
| `PORT`                       | no         | HTTP port (default `8080`).                                                                                                                                         |
| `VERIFYAX_MCP_TARGET_ENV`    | no         | Set by convenience scripts (`production` \| `development` \| `testing`). When `development` or `testing`, non-production `VERIFYAX_*_BASE_URL` values are required. |
| `VERIFYAX_MCP_ALLOWED_HOSTS` | no         | Comma-separated Host header allowlist (DNS rebinding protection when binding `0.0.0.0`).                                                                            |

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
