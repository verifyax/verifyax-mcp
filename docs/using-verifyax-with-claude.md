# Using VerifyAX with Claude

There are three ways to drive the [VerifyAX](https://verifyax.com) agent-evaluation platform from
Claude or your own code. They overlap on purpose — pick by how you work, not by capability.

| Surface                         | What it is                                       | Best for                                                                               | Install                                                                                                        |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`verifyax-mcp`** (MCP server) | Native MCP tools Claude calls directly           | Conversational workflows — "register this agent and evaluate it" — with no code        | `/plugin install verifyax-mcp@verifyax-plugins`, or `claude mcp add verifyax … -- npx -y @verifyax/mcp-server` |
| **`verifyax-api`** (skill)      | Teaches Claude to drive the REST API via scripts | Developers who want Claude to _write code_ against the API, or custom multi-step logic | `/plugin install verifyax-api@verifyax-plugins`                                                                |
| **`@verifyax/sdk`** (library)   | Typed TypeScript client                          | Building your own app, service, or automation on VerifyAX                              | `npm install @verifyax/sdk`                                                                                    |

## How to choose

- **You want to talk to Claude and have it just do it** (register, generate, evaluate, read scores)
  → **`verifyax-mcp`**. Claude calls the 12 tools itself; blocking tools (generate, evaluate) wait
  for completion and return results. No scripts, no manual polling, no copy-pasting UUIDs.

- **You're writing code, or want Claude to produce a script you can keep** → **`verifyax-api`
  skill**. It teaches Claude the endpoints, async semantics, and tag rules so it can author
  Python/REST calls tailored to your workflow.

- **You're building software on top of VerifyAX** → **`@verifyax/sdk`**. Resource-oriented client
  (`client.agents.create(...)`, `client.simulations.simulate(...)`) with a typed error hierarchy and
  in-SDK polling. The MCP server is built on it.

## Notes

- All three authenticate with a VerifyAX API key (Settings → API Keys in the
  [console](https://console.verifyax.com)). The MCP plugin prompts for it securely; the skill and
  SDK read `VERIFYAX_API_KEY` from the environment.
- The MCP server and the skill are complementary, not competing — the same person might use the MCP
  tools for quick evals and the SDK for a CI integration.
- Source & issues: [verifyax/verifyax-mcp](https://github.com/verifyax/verifyax-mcp) (SDK + MCP
  server), [verifyax/verifyax-plugins](https://github.com/verifyax/verifyax-plugins) (the marketplace).
