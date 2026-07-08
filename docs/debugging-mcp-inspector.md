# Debugging with MCP Inspector

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is the official interactive
UI for listing tools, calling them, and inspecting responses. Run it with `npx` — no install
required.

> **Shells:** the commands below use `\` line-continuations (bash / zsh / macOS / Linux). In
> **Windows PowerShell**, put each command on one line, or continue with a backtick `` ` `` instead
> of `\`.
>
> **Pass the key with `-e`:** Inspector does **not** inherit your shell environment — the spawned
> server only sees variables passed explicitly via `-e KEY=value`.

## stdio (local default)

Inspector spawns the server as a subprocess. Build first, then:

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
> Or skip the subprocess entirely and use **Streamable HTTP** below, which has no spawn step and
> isn't affected.

## Streamable HTTP

For the HTTP entry point (`verifyax-mcp-server-http`). Works the same on all platforms (no command
spawn, so the spaces caveat above doesn't apply). Start the server in one terminal, then open
Inspector in another:

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
