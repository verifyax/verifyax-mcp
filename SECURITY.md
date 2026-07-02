# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue or PR.

- Preferred: open a [GitHub private security advisory](https://github.com/verifyax/verifyax-mcp/security/advisories/new) on this repository.
- Or email **security@conscium.com** (subject: `verifyax-mcp security`).

Include enough detail to reproduce (affected package/version, steps, and impact). We'll acknowledge your report and keep you updated on remediation.

## Scope

This repository ships two npm packages, `@verifyax/sdk` and `@verifyax/mcp-server`. Both handle a user's **VerifyAX API key**:

- **stdio** (default): the key is read from `VERIFYAX_API_KEY` in the client's local environment and never leaves the user's machine.
- **Streamable HTTP** (`verifyax-mcp-server-http`): each request carries the caller's own key (`Authorization: Bearer` / `X-VerifyAX-API-Key`); it is validated per request and held only for a session's bounded lifetime. See [`deploy/gcp/README.md`](deploy/gcp/README.md) for the hardening required before self-hosting.

## Handling API keys

- Never paste a key into a chat, issue, log, or commit. The server logs to stderr with secret redaction, but treat keys as sensitive end to end.
- Rotate a key immediately if it may have been exposed (VerifyAX console → Settings → API Keys).

## Supported versions

Fixes land on the latest released `0.2.x`. Both packages are versioned in lockstep.
