<h1 align="center">VerifyAX MCP Server</h1>

<p align="center">
  <b>The official Model Context Protocol (MCP) server for VerifyAX: a cloud-hosted bridge that gives your AI tools secure, real-time access to register agents, generate scenarios, run simulations, and read evaluations on the VerifyAX platform.</b>
</p>

<!-- Line 1 · Project -->
<p align="center">
  <img src="https://img.shields.io/badge/Official-VerifyAX-0052CC" alt="Official VerifyAX Server">
  <a href="https://github.com/verifyax/verifyax-mcp/stargazers"><img src="https://img.shields.io/github/stars/verifyax/verifyax-mcp?style=flat&logo=github&label=Stars&color=0052CC" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/verifyax/verifyax-mcp?label=License&color=0052CC" alt="License: Apache 2.0"></a>
  <img src="https://img.shields.io/badge/Status-Generally_Available-2EBC4F" alt="Status: Generally Available">
</p>

<!-- Line 2 · Protocol & access -->
<p align="center">
  <img src="https://img.shields.io/badge/Model_Context_Protocol-compatible-000000?logo=modelcontextprotocol&logoColor=white" alt="Model Context Protocol compatible">
  <a href="server.json"><img src="https://img.shields.io/badge/MCP_Registry-io.github.verifyax-000000?logo=modelcontextprotocol&logoColor=white" alt="MCP Registry: io.github.verifyax"></a>
  <img src="https://img.shields.io/badge/Auth-API_key-2EBC4F" alt="Auth: API key">
  <img src="https://img.shields.io/badge/Hosting-VerifyAX_Cloud_%7C_Self--host-0052CC" alt="Hosting: VerifyAX Cloud or self-host">
</p>

<!-- Line 3 · Capabilities -->
<p align="center">
  <img src="https://img.shields.io/badge/Agents-0052CC" alt="Agents">
  <img src="https://img.shields.io/badge/Scenarios-0052CC" alt="Scenarios">
  <img src="https://img.shields.io/badge/Simulations-0052CC" alt="Simulations">
  <img src="https://img.shields.io/badge/Evaluations-0052CC" alt="Evaluations">
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/verifyax/verifyax-mcp">
    <img src="https://glama.ai/mcp/servers/verifyax/verifyax-mcp/badges/score.svg" alt="verifyax/verifyax-mcp MCP server">
  </a>
</p>

<p align="center">
  <a href="#install-the-mcp-server"><b>Getting started</b></a> ·
  <a href="#supported-tools"><b>Supported tools</b></a> ·
  <a href="#data-and-security"><b>Security</b></a> ·
  <a href="deploy/gcp/README.md"><b>Deploy your own</b></a> ·
  <a href="https://github.com/verifyax/verifyax-mcp/issues"><b>Report an issue</b></a>
</p>

---

The **official VerifyAX MCP Server** is a bridge between your MCP-compatible AI client and the
[VerifyAX](https://verifyax.com) agent-evaluation platform. Once configured, it lets you register
agents, generate scenarios, run simulations, and read evaluations in natural language — without
writing API scripts.

With the VerifyAX MCP Server, you can:

- **Register and test agents** (A2A or API) and confirm connectivity before evaluation.
- **Generate scenarios** from skill tags and wait for completion in one tool call.
- **Run evaluations** and read scores, transcripts, and credit usage without manual polling.

It complements (does not replace) the [`verifyax-api` skill](https://github.com/verifyax/verifyax-plugins):
the skill is for developers writing code; the MCP server is for conversational workflows.

## Contents

- [Supported clients](#supported-clients)
- [Supported tools](#supported-tools)
- [Before you start](#before-you-start)
- [Install the MCP server](#install-the-mcp-server)
- [How it works](#how-it-works)
- [Example workflows](#example-workflows)
- [Tips and tricks](#tips-and-tricks)
- [Data and security](#data-and-security)
- [Troubleshooting](#troubleshooting)
- [Support and feedback](#support-and-feedback)
- [Disclaimer](#disclaimer)
- [For developers](#for-developers)
- [License](#license)

---

## Supported clients

The VerifyAX MCP Server works with MCP-compatible clients that support **Streamable HTTP** or
**stdio**:

| Client                                | Setup reference                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI ChatGPT                        | [Connectors / MCP guide](https://platform.openai.com/docs/guides/tools-connectors-mcp)                |
| Claude (Claude.ai, Desktop, and Code) | [Claude MCP docs](https://code.claude.com/docs/en/mcp)                                                |
| Cursor                                | [Cursor MCP docs](https://cursor.com/docs/mcp)                                                        |
| Visual Studio Code (GitHub Copilot)   | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)                       |
| GitHub Copilot CLI                    | [About Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)             |
| Google Gemini CLI                     | [Gemini CLI MCP docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) |
| Amazon Quick Suite                    | [MCP integration guide](https://docs.aws.amazon.com/quicksuite/latest/userguide/mcp-integration.html) |

Any client that can connect via [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) can also
use the hosted endpoint at `https://mcp.verifyax.com/mcp`.

> [!TIP]
> For step-by-step Claude setup and how this compares to the VerifyAX skill and SDK, see
> [`docs/using-verifyax-with-claude.md`](docs/using-verifyax-with-claude.md).

---

## Supported tools

Twelve tools mapped to user intents. Blocking tools poll internally and return only when work
completes (typically 30s–5min).

| Area           | Tools                                                                               |           Blocking            |
| -------------- | ----------------------------------------------------------------------------------- | :---------------------------: |
| **Agents**     | `register_agent` · `list_agents` · `delete_agent`                                   |               —               |
| **Scenarios**  | `list_compatible_tags` · `generate_scenario` · `list_scenarios` · `delete_scenario` | **yes** (`generate_scenario`) |
| **Evaluation** | `evaluate_agent` · `list_recent_runs` · `get_run_details`                           |  **yes** (`evaluate_agent`)   |
| **Usage**      | `get_usage_summary` · `preview_run_cost`                                            |               —               |

> [!NOTE]
> For tool descriptions (what Claude reads to pick a tool) and rationale, see
> [`docs/tool-descriptions.md`](docs/tool-descriptions.md). Package-level reference:
> [`packages/mcp-server/README.md`](packages/mcp-server/README.md).

---

## Before you start

Requirements depend on how you connect.

### Remote HTTP (hosted at `mcp.verifyax.com`)

- A **VerifyAX API key** (Settings → API Keys in the [console](https://console.verifyax.com))
- An MCP client with **Streamable HTTP** support, or **Node.js 18+** to run the
  [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) proxy

### Local stdio (`npx @verifyax/mcp-server`)

- **Node.js ≥ 20**
- A VerifyAX API key in your client config (`VERIFYAX_API_KEY`)

---

## Install the MCP server

### Remote HTTP (recommended)

Hosted endpoint:

```
https://mcp.verifyax.com/mcp
```

Send your VerifyAX API key on the initialize request. The hosted server does **not** store keys —
each client session brings its own.

**Cursor (native URL — v0.48+):**

```json
{
  "mcpServers": {
    "verifyax": {
      "url": "https://mcp.verifyax.com/mcp",
      "headers": {
        "Authorization": "Bearer sk-ver-api-..."
      }
    }
  }
}
```

Do **not** add a `transport` field — Cursor detects Streamable HTTP from the URL. You can also use
`"X-VerifyAX-API-Key": "sk-ver-api-..."` instead of `Authorization`.

**Claude Desktop / clients without native HTTP (`mcp-remote`):**

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "verifyax": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.verifyax.com/mcp",
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

Use `--transport http-only` because this server speaks Streamable HTTP only (no legacy SSE). You
can also pass `X-VerifyAX-API-Key: sk-ver-api-...` via `--header` instead of `Authorization`.

Restart your MCP client after changing config.

### Local stdio

**Claude Code:**

```bash
claude mcp add verifyax --env VERIFYAX_API_KEY=sk-ver-api-... -- npx -y @verifyax/mcp-server
```

**Claude Desktop:**

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

Restart the client after changing config, then describe what you want in natural language.

---

## How it works

### Architecture and communication

1. Your MCP client connects to `https://mcp.verifyax.com/mcp` (remote HTTP) or spawns
   `npx @verifyax/mcp-server` (local stdio).
2. The client sends **your** VerifyAX API key on initialize (`Authorization: Bearer …` or
   `X-VerifyAX-API-Key` for HTTP; `VERIFYAX_API_KEY` env for stdio).
3. The server calls the VerifyAX API on your behalf. Blocking tools (`generate_scenario`,
   `evaluate_agent`) poll job status internally and return only when work finishes.

### Permission and billing

- Actions are scoped to the **workspace** tied to your API key.
- Usage and credits are billed to **your** VerifyAX workspace, not to the MCP server operator.
- The hosted server sends **no telemetry** and does not persist API keys between sessions.

### Self-hosting

Run the same HTTP server on your own infrastructure (e.g. Google Cloud Run). See
[`deploy/gcp/README.md`](deploy/gcp/README.md).

---

## Example workflows

Once connected, describe tasks in natural language — the client picks the tool.

### Agent setup

- **Register**: _"Register my A2A agent at https://my-agent.example.com and confirm it's reachable."_
- **List**: _"What agents are registered in my workspace?"_

### Scenario authoring

- **Discover tags**: _"List the skill tags I can use for an interview scenario."_
- **Generate**: _"Generate an info_exchange scenario tagged empathy and coordination."_

### Evaluation

- **Run eval**: _"Evaluate agent X against scenario Y and summarize the scores."_
- **Review history**: _"Show details for my most recent simulation run."_

### Usage and cost

- **Preview**: _"How many credits will it cost to run this scenario against my agent?"_
- **Summary**: _"What did my last 5 simulation runs cost?"_

> [!NOTE]
> Blocking tools can take 30s–5min. Do not call them repeatedly — wait for the result.

---

## Tips and tricks

### Add defaults to AGENTS.md

Reduce discovery calls and bad tag combinations by adding this to an `AGENTS.md` file in your
project root (see the [AGENTS.md convention](https://agents.md/) for the format):

```md
## VerifyAX MCP

When connected to verifyax:

- **MUST** call `list_compatible_tags` before `generate_scenario`
- **MUST NOT** combine QnA tags with other tags (QnA must be the sole tag)
- **MUST** use `preview_run_cost` when the user asks about credits before `evaluate_agent`
- Blocking tools (`generate_scenario`, `evaluate_agent`) take 30s–5min — do not retry manually
```

### Use the skill for code workflows

For scripts, CI, or custom multi-step logic, use the
[`verifyax-api` skill](https://github.com/verifyax/verifyax-plugins) or
[`@verifyax/sdk`](packages/sdk) instead of MCP tools.

---

## Data and security

- All traffic to the hosted endpoint uses **HTTPS (TLS)**.
- **API key** authentication; every action respects your VerifyAX workspace permissions.
- The hosted server does **not** store API keys — each session supplies its own.
- The MCP server sends **no telemetry**; it talks only to the VerifyAX API.
- Destructive tools (`delete_agent`, `delete_scenario`) permanently remove resources — confirm
  with the user before calling them.

API keys are managed in the [VerifyAX console](https://console.verifyax.com) (Settings → API Keys).
Revoke a key there to cut off access immediately.

---

## Troubleshooting

- **"VERIFYAX_API_KEY is not set"** — the key isn't reaching the server. Check the `env` block
  (stdio) or `Authorization` / `X-VerifyAX-API-Key` header (HTTP).
- **Authentication failed** — the key is invalid, revoked, or from the wrong environment. Mint a
  fresh one in the console.
- **Tool calls don't appear** — MCP clients load tools at startup; restart the client (or start a
  new session) after adding the server.
- **HTTP connection fails in Cursor** — try `mcp-remote` with `--transport http-only`, or verify
  the URL ends with `/mcp`.
- **Want logs?** Set `VERIFYAX_MCP_LOG_LEVEL=debug`. Logs are structured JSON on stderr; stdout is
  reserved for the MCP protocol.

---

## Support and feedback

This project is maintained by the VerifyAX team at [Conscium](https://conscium.com).

- **Bugs and feature requests:** [open an issue](https://github.com/verifyax/verifyax-mcp/issues)
- **Development reference:** [`CONTRIBUTING.md`](CONTRIBUTING.md) (maintainers and forks)
- **External pull requests aren't accepted** — issues are the best way to reach us

---

## Disclaimer

MCP clients can register agents, generate scenarios, run evaluations, and delete resources using
your VerifyAX API key and workspace credits. Use least privilege (scoped keys, minimal workspace
access), review high-impact actions before confirming, and revoke keys you no longer need.

Model Context Protocol connects AI agents to external tools, which creates powerful workflows but
also structural risks. Large language models can be vulnerable to prompt injection and related
attacks. Only use trusted MCP clients and servers, and review which tools each agent can access.

---

## For developers

This repository is a pnpm monorepo with two packages:

| Package                                       | Description                                       |
| --------------------------------------------- | ------------------------------------------------- |
| [`@verifyax/sdk`](packages/sdk)               | Typed TypeScript client for the VerifyAX REST API |
| [`@verifyax/mcp-server`](packages/mcp-server) | MCP server (12 tools) built on the SDK            |

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

- **MCP Inspector:** [`docs/debugging-mcp-inspector.md`](docs/debugging-mcp-inspector.md)
- **Execution plan:** [`docs/PLAN.md`](docs/PLAN.md)
- **Architecture decisions:** [`CLAUDE.md`](CLAUDE.md)
- **Cloud Run deploy:** [`deploy/gcp/README.md`](deploy/gcp/README.md)

---

## License

Apache-2.0. See [`LICENSE`](LICENSE).
