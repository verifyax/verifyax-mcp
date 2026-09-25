# Using VerifyAX with Claude

> [!NOTE]
> **This page is the canonical guide to using VerifyAX from Claude.** Other surfaces — the
> `verifyax-mcp` and `verifyax-plugins-claude` READMEs, and any page on conscium.com — should link
> here rather than restate the setup. Install commands, pinned versions and client support change
> with the code, so they are maintained in the repository that changes them and reviewed with it.

There are three ways to drive the [VerifyAX](https://verifyax.com) agent-evaluation platform from
Claude or your own code. They overlap on purpose — pick by how you work, not by capability.

| Surface                         | What it is                                       | Best for                                                                               | Install                                                                                                                               |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **`verifyax-mcp`** (MCP server) | Native MCP tools Claude calls directly           | Conversational workflows — "register this agent and evaluate it" — with no code        | `/plugin install verifyax-mcp@verifyax-plugins`, or `claude mcp add verifyax … -- npx -y -p @verifyax/mcp-server verifyax-mcp-server` |
| **`verifyax-api`** (skill)      | Teaches Claude to drive the REST API via scripts | Developers who want Claude to _write code_ against the API, or custom multi-step logic | `/plugin install verifyax-api@verifyax-plugins`                                                                                       |
| **`@verifyax/sdk`** (library)   | Typed TypeScript client                          | Building your own app, service, or automation on VerifyAX                              | `npm install @verifyax/sdk`                                                                                                           |

## How to choose

- **You want to talk to Claude and have it just do it** (register, generate, evaluate, read scores)
  → **`verifyax-mcp`**. Claude calls the 12 tools itself. Long-running tools (`generate_scenario`,
  `evaluate_agent`) return a pollable MCP task when the client supports Tasks; otherwise they block
  until completion. No scripts, no manual UUID polling, no copy-pasting UUIDs.

- **You're writing code, or want Claude to produce a script you can keep** → **`verifyax-api`
  skill**. It teaches Claude the endpoints, async semantics, and tag rules so it can author
  Python/REST calls tailored to your workflow.

- **You're building software on top of VerifyAX** → **`@verifyax/sdk`**. Resource-oriented client
  (`client.agents.create(...)`, `client.simulations.simulate(...)`) with a typed error hierarchy and
  in-SDK polling. The MCP server is built on it.

## Which Claude surface?

- **Claude Code** — all three work: both plugins and the SDK.
- **Claude Desktop** — `verifyax-mcp` works via [`mcp-remote`](https://www.npmjs.com/package/mcp-remote),
  which holds your key in local config.
- **Claude.ai (web)** — use the **hosted endpoint as a custom connector**, not the plugin. The
  plugin launches a local MCP server, which chat cannot run; the hosted endpoint has no such
  constraint. In **Settings → Connectors → Add custom connector**, point at
  `https://mcp.verifyax.com/mcp`, choose **No sign-in**, and add a request header `Authorization`
  with the value `Bearer sk-ver-api-...`. All 12 tools appear, with per-tool approval controls.
  Needs server 0.3.5 or later. The `verifyax-api` skill is also available here: download the bundle
  from the [plugin releases](https://github.com/verifyax/verifyax-plugins-claude/releases) and
  upload it under **Customize → Skills**.
- **Cowork** — `verifyax-api` only for plugins, since plugins that launch a local MCP server do not
  load there. The hosted connector route above has not been tested in Cowork.

## Notes

- All three authenticate with a VerifyAX API key (Settings → API Keys in the
  [console](https://console.verifyax.com)). The MCP plugin prompts for it securely; the skill and
  SDK read `VERIFYAX_API_KEY` from the environment.
- The MCP server and the skill are complementary, not competing — the same person might use the MCP
  tools for quick evals and the SDK for a CI integration.
- Source & issues: [verifyax/verifyax-mcp](https://github.com/verifyax/verifyax-mcp) (SDK + MCP
  server), [verifyax/verifyax-plugins-claude](https://github.com/verifyax/verifyax-plugins-claude) (the marketplace).
