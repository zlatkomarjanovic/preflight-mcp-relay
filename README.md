# Preflight MCP Server

Exposes Framer Preflight audits and fix tools to **Claude Desktop** via stdio.

No Anthropic API key in the Framer plugin — users authenticate through Claude.

## Why npm?

This package is distributed on npm so every user runs the same MCP server locally:

```bash
npx -y @zlatkomarjanovicorg2000/preflight-mcp-server@latest
```

Claude Desktop loads it from `claude_desktop_config.json` (stdio). **No public URL is required.**

## User setup (production)

1. Open the Preflight plugin in Framer → **Connect Claude** (copies config).
2. Claude Desktop → **Settings → Developer → Edit Config** — paste and restart Claude.
3. Keep Preflight open in Framer (bridge on `ws://127.0.0.1:3847`).

```json
{
  "mcpServers": {
    "preflight": {
      "command": "npx",
      "args": ["-y", "@zlatkomarjanovicorg2000/preflight-mcp-server@latest"]
    }
  }
}
```

Requires Node.js 18+.

### Not the “Add custom connector” URL form

Claude’s **Settings → Connectors → Add custom connector** expects a **public `https://` MCP endpoint** (Anthropic’s servers call it). Preflight must talk to Framer on the user’s machine, so the production path is **Developer → Edit Config** above — same model as most local MCP servers.

Optional `--http` mode (`http://127.0.0.1:3848/mcp`) is for development only.

## Deploy cloud relay (Name + URL connector)

Runs public MCP + WebSocket bridge so users only paste **Name** and **URL** in Claude.

```bash
npm run build
node dist/index.js --relay   # local test on :8080
```

**Deploy to Render (recommended):**

1. Push `mcp-server/` to GitHub (or connect repo in Render).
2. New → Web Service → Docker, root `mcp-server`, uses `render.yaml`.
3. After deploy, copy URL e.g. `https://preflight-mcp-relay.onrender.com`
4. Build Framer plugin with `VITE_MCP_PUBLIC_URL=https://preflight-mcp-relay.onrender.com`

**Deploy to Fly.io:** `fly launch` in `mcp-server/` (uses `fly.toml` + `Dockerfile`).

Claude connector URL format: `https://YOUR_HOST/mcp?session=SESSION_FROM_PLUGIN`

## Publish to npm

```bash
npm publish --access public
```

Package: `@zlatkomarjanovicorg2000/preflight-mcp-server`

## Local development

```bash
npm install
npm run build
node dist/index.js
```

In `preflight/.env.local` set `VITE_MCP_SERVER_PATH` to the absolute path of `dist/index.js`.
