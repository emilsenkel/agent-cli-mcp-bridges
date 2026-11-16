# agent-cli-mcp-bridges

A small MCP (Model Context Protocol) server that exposes a *headless* coding
agent CLI — Claude Code, Hermes, Grok Build, or any similar binary — over
Streamable HTTP and SSE.

The shared pattern is: a new CLI process per request, optional session resume,
a configurable project root, and no tokens in the repo. An optional `notify`
tool POSTs a JSON body to `WEBHOOK_URL` if you set one; there is no built-in
messaging integration.

## Stack

Node.js 20+, `@modelcontextprotocol/sdk`, Express, zod.

## Setup

```bash
npm install
cp .env.example .env
# write a token file (mode 600), or export MCP_TOKEN for local testing only
mkdir -p ~/.config/agent-cli-mcp
# example: openssl rand -hex 24 > ~/.config/agent-cli-mcp/token
# chmod 600 ~/.config/agent-cli-mcp/token
export MCP_TOKEN_FILE=~/.config/agent-cli-mcp/token
export AGENT_PROFILE=claude
export PROJECT_ROOT="$PWD"
npm start
```

Point an MCP client at `http://127.0.0.1:8790/mcp` with
`Authorization: Bearer <token>`. SSE is at `/sse`.

## Tools

| Tool | Purpose |
|------|---------|
| `agent_status` | Binary path, profile, default cwd, timeout |
| `ask_agent` | Run the CLI headless with a prompt, optional cwd/model/resume |
| `notify` | Optional. POST `{ "text": "..." }` to `WEBHOOK_URL` |

## Config

See `.env.example`. `AGENT_PROFILE` selects default flags:

- `claude` — `claude --print --permission-mode <mode> --add-dir <cwd>`
- `hermes` — `hermes --print` (plus cwd/model/resume when set)
- `grok` — `grok --prompt-file <tempfile>` (the prompt is never put on the argv)
- `custom` — `AGENT_BIN` is required; the prompt is written to a temp file and
  passed as the last argument unless you set `AGENT_PROMPT_FLAG`

## Licence

MIT, Copyright (c) 2026 Emil Senkel.
