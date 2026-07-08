<h1 align="center">VerifyAX MCP Server</h1>
<p align="center">
  <b>The official Model Context Protocol (MCP) server for VerifyAX: a cloud-hosted bridge that gives your AI tools secure, real-time access to VerifyAX platform, to connect their, define tests and run simulations to evaluate agents behaviour against defined criteria .</b>
</p>
<!-- Line 1 · Project -->
<p align="center">

  <a href="https://github.com/verifyax/verifyax-mcp/stargazers"><img src="https://img.shields.io/github/stars/verifyax/verifyax-mcp?style=flat&logo=github&label=Stars&color=0052CC" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/verifyax/verifyax-mcp?label=License&color=0052CC" alt="License: Apache 2.0"></a>
  <img src="https://img.shields.io/badge/Status-Generally_Available-2EBC4F" alt="Status: Generally Available">
</p>

<!-- Line 2 · Protocol & access -->
<p align="center">
  <img src="https://img.shields.io/badge/Model_Context_Protocol-compatible-000000?logo=modelcontextprotocol&logoColor=white" alt="Model Context Protocol compatible">
  <a href="server.json"><img src="https://img.shields.io/badge/MCP_Registry-verifyax.com-000000?logo=modelcontextprotocol&logoColor=white" alt="MCP Registry: verifyax.com"></a>


</p>
Conversational access to the [VerifyAX](https://verifyax.com) agent-evaluation platform, plus
the typed SDK it is built on. Two packages in one pnpm monorepo:

| Package                                       | Description                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@verifyax/sdk`](packages/sdk)               | Typed TypeScript client for the VerifyAX REST API. Reusable by any consumer.    |
| [`@verifyax/mcp-server`](packages/mcp-server) | MCP server exposing 12 VerifyAX tools mapped to user intents. Built on the SDK. |

This complements (does not replace) the [`verifyax-api` skill](https://github.com/verifyax/verifyax-plugins):
the skill is for developers writing code; the MCP server is for conversational workflows.

## Table of contents
- [Supported Clients](#s)
- [Install the MCP server](#install-the-mcp-server)
- [What you can ask](#what-you-can-ask)
- [Troubleshooting](#troubleshooting)
- [Status](#status)
- [Development](#development)
  - [Debugging with MCP Inspector](#debugging-with-mcp-inspector)
- [Privacy](#privacy)
- [License](#license)


## Supported clients

The VerifyAX MCP Server is compatible with several clients:

| Client | Setup reference |
| --- | --- |
| OpenAI ChatGPT | [Connectors / MCP guide](https://platform.openai.com/docs/guides/tools-connectors-mcp) |
| Claude (Claude.ai, Desktop, and Code) | [Claude MCP docs](https://code.claude.com/docs/en/mcp) |
| Cursor | [Cursor MCP docs](https://cursor.com/docs/mcp) |
| Visual Studio Code (GitHub Copilot) | [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) |
| GitHub Copilot CLI | [About Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli) |
| Google Gemini CLI | [Gemini CLI MCP docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) |
| Amazon Quick Suite | [MCP integration guide](https://docs.aws.amazon.com/quicksuite/latest/userguide/mcp-integration.html) |

 

## Install the MCP server
### Running locally with stdio transport
Requires Node ≥ 20 and a VerifyAX API key (Settings → API Keys in the
[console](https://console.verifyax.com)).

**Claude Code:**

```bash
claude mcp add verifyax --env VERIFYAX_API_KEY=sk-ver-api-... -- npx -y @verifyax/mcp-server
```

**Claude Desktop** Add this to your (`claude_desktop_config.json`):

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


### Running with Streamable HTTP transport

A supported client connects to the server endpoint. The endpoint of our deployed MCP server is:
 ```
https://mcp.verifyax.com/mcp
  ```


  **Claude Desktop** Add this to your (`claude_desktop_config.json`):

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
        "VERIFYAX_AUTH": "Bearer your-verifyax-api-key"
      }
    }
}
}
```
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

See [`docs/PLAN.md`](docs/PLAN.md) for the phased execution plan and [`CLAUDE.md`](CLAUDE.md) for
project context and architecture decisions.

This project is maintained internally by the VerifyAX team at [Conscium](https://conscium.com).
**External pull requests aren't accepted** — please [open an issue](https://github.com/verifyax/verifyax-mcp/issues)
to report a bug, an outdated API behavior, or a feature request; that's the best way to reach us.
[`CONTRIBUTING.md`](CONTRIBUTING.md) is the development reference for maintainers and forks.

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

### Debugging with MCP Inspector

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is the official interactive
UI for listing tools, calling them, and inspecting responses. Run it with `npx` — no install
required.

> **Shells:** the commands below use `\` line-continuations (bash / zsh / macOS / Linux). In
> **Windows PowerShell**, put each command on one line, or continue with a backtick `` ` `` instead
> of `\`.
>
> **Pass the key with `-e`:** Inspector does **not** inherit your shell environment — the spawned
> server only sees variables passed explicitly via `-e KEY=value`.

**stdio (local default)** — Inspector spawns the server as a subprocess. Build first, then:

```bash
pnpm build

npx @modelcontextprotocol/inspector \
  -e VERIFYAX_API_KEY=sk-ver-api-... \
  node packages/mcp-server/dist/index.js
```

```powershell
# Windows PowerShell (single line)
pnpm build
npx @modelcontextprotocol/inspector -e VERIFYAX_API_KEY=sk-ver-api-... node packages/mcp-server/dist/index.js
```

Inspector opens a browser tab (default `http://localhost:6274`). Use the **Tools** pane to call
`list_compatible_tags` or other non-blocking tools first.

To exercise the published package without a local build:

```bash
npx @modelcontextprotocol/inspector \
  -e VERIFYAX_API_KEY=sk-ver-api-... \
  npx -y @verifyax/mcp-server
```

> **Windows — avoid spaces in the Command path.** Inspector's stdio launcher splits the spawn
> command on spaces, so a node path like `C:\Program Files\nodejs\node.exe` (or a repo under a
> folder such as `OneDrive - Company`) fails with _"command not found"_ / _"connection closed"_.
> Use space-free paths: the 8.3 short name for node (`C:\PROGRA~1\nodejs\node.exe`) and a no-space
> working copy (e.g. a directory junction: `mklink /J C:\verifyax "C:\Users\you\OneDrive - Co\verifyax"`).
> Or skip the subprocess entirely and use the **Streamable HTTP** mode below, which has no spawn
> step and isn't affected.

**Streamable HTTP** — for the HTTP entry point (`verifyax-mcp-server-http`). Works the same on all
platforms (no command spawn, so the spaces caveat above doesn't apply). Start the server in one
terminal, then open Inspector in another:

```bash
# terminal 1
pnpm build
node packages/mcp-server/dist/http.js

# terminal 2
npx @modelcontextprotocol/inspector
```

In the Inspector UI, choose **Streamable HTTP**, set the URL to `http://127.0.0.1:8080/mcp`, and
add a header: `Authorization: Bearer sk-ver-api-...` (or `X-VerifyAX-API-Key: sk-ver-api-...`).

For scripted checks from the CLI:

```bash
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8080/mcp \
  --transport http \
  --header "Authorization: Bearer sk-ver-api-..." \
  --method tools/list
```

Set `VERIFYAX_MCP_LOG_LEVEL=debug` on the server process to see structured JSON logs on stderr
while you test.

## Privacy

The MCP server sends **no telemetry**. It talks only to the VerifyAX API using the key you
provide via `VERIFYAX_API_KEY`.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
