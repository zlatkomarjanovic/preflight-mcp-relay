#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { FramerBridge } from "./bridge.js"
import { createPreflightMcpServer } from "./createServer.js"
import { startHttpMcpServer } from "./http.js"
import { startCloudRelay } from "./relay.js"
const __dirname = dirname(fileURLToPath(import.meta.url))

function useHttpMode(): boolean {
  return process.argv.includes("--http")
}

function useRelayMode(): boolean {
  return process.argv.includes("--relay")
}

async function main(): Promise<void> {
  const bridge = new FramerBridge()
  bridge.start()

  if (useRelayMode()) {
    await startCloudRelay()
    return
  }

  if (useHttpMode()) {
    await startHttpMcpServer(bridge)
    return
  }

  const server = createPreflightMcpServer(bridge)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  if (process.env.PREFLIGHT_MCP_CONFIG_HINT === "1") {
    const entry = join(__dirname, "index.js")
    console.error(
      JSON.stringify(
        {
          mcpServers: {
            preflight: {
              command: process.execPath,
              args: [entry],
            },
          },
        },
        null,
        2,
      ),
    )
  }
}

main().catch((err) => {
  console.error("[preflight-mcp] fatal:", err)
  process.exit(1)
})
