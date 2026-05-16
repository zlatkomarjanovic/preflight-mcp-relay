import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { PreflightBridge } from "./bridgeInterface.js"
import { registerPreflightTools } from "./tools.js"

export function createPreflightMcpServer(bridge: PreflightBridge): McpServer {
  const server = new McpServer(
    {
      name: "preflight",
      version: "1.0.0",
    },
    {
      instructions: `You are connected to Framer Preflight via MCP.

Auth: The user is already signed in through Claude (Claude Desktop or claude.ai). You do not need an Anthropic API key in Preflight.

Before fixing issues:
1. Ensure the Preflight plugin is open in Framer (bridge must be connected).
2. Call preflight_run_scan or preflight_get_latest_audit.
3. Use preflight_get_findings to see blockers.
4. Apply fixes with preflight_set_image_alt, preflight_set_link, preflight_set_page_seo, preflight_set_cms_* tools.
5. Re-run preflight_run_scan to verify.

Read-only: preflight_list_audit_history, resource preflight://audit/latest`,
    },
  )

  registerPreflightTools(server, bridge)
  return server
}
