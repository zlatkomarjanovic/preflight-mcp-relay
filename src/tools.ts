import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as z from "zod"
import { PRO_PRICE_DISPLAY } from "./billing/config.js"
import { isProUser } from "./billing/stripeService.js"
import type { PreflightBridge } from "./bridgeInterface.js"

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  }
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  }
}

async function requireProForBridge(bridge: PreflightBridge): Promise<string | null> {
  const userId = bridge.getFramerUserId?.() ?? null
  if (await isProUser(userId)) return null
  return `Preflight Pro required (${PRO_PRICE_DISPLAY}). Subscribe in the Preflight plugin in Framer, then retry.`
}

export function registerPreflightTools(server: McpServer, bridge: PreflightBridge): void {
  server.registerTool(
    "preflight_run_scan",
    {
      description:
        "Run a full Preflight audit on the open Framer project (pages, SEO, images, CMS, links, PageSpeed). Requires the Preflight plugin open in Framer.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async () => {
      try {
        const result = await bridge.call("run_scan")
        return textResult(result)
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_get_latest_audit",
    {
      description: "Get the most recent Preflight scan (score, status, counts, findings summary).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return textResult(await bridge.call("get_latest_audit"))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_list_audit_history",
    {
      description: "List past Preflight audits stored for this project.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return textResult(await bridge.call("list_audit_history"))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_get_findings",
    {
      description: "Get findings from the latest audit, optionally filtered.",
      inputSchema: {
        severity: z
          .enum(["critical", "warning", "suggestion"])
          .optional()
          .describe("Filter by severity"),
        category: z
          .string()
          .optional()
          .describe("Filter by category: seo, assets, links, cms, speed, etc."),
        limit: z.number().optional().describe("Max findings to return (default 50)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        return textResult(await bridge.call("get_findings", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_set_image_alt",
    {
      description: "Set alt text on a Framer layer background image.",
      inputSchema: {
        nodeId: z.string(),
        altText: z.string(),
      },
      annotations: { destructiveHint: false },
    },
    async (args) => {
      const denied = await requireProForBridge(bridge)
      if (denied) return toolError(denied)
      try {
        return textResult(await bridge.call("set_image_alt", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_set_link",
    {
      description: "Set the URL on a linked Framer layer.",
      inputSchema: {
        nodeId: z.string(),
        url: z.string(),
      },
    },
    async (args) => {
      const denied = await requireProForBridge(bridge)
      if (denied) return toolError(denied)
      try {
        return textResult(await bridge.call("set_link", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_set_page_seo",
    {
      description: "Set page title and/or meta description via Framer localization (Page SEO).",
      inputSchema: {
        pageId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async (args) => {
      const denied = await requireProForBridge(bridge)
      if (denied) return toolError(denied)
      try {
        return textResult(await bridge.call("set_page_seo", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_set_cms_text_field",
    {
      description: "Fill a CMS text field on a collection item.",
      inputSchema: {
        collectionItemId: z.string(),
        fieldName: z.string(),
        value: z.string(),
      },
    },
    async (args) => {
      const denied = await requireProForBridge(bridge)
      if (denied) return toolError(denied)
      try {
        return textResult(await bridge.call("set_cms_text_field", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_set_cms_image_alt",
    {
      description: "Set alt text on a CMS image field.",
      inputSchema: {
        collectionItemId: z.string(),
        fieldName: z.string(),
        altText: z.string(),
      },
    },
    async (args) => {
      const denied = await requireProForBridge(bridge)
      if (denied) return toolError(denied)
      try {
        return textResult(await bridge.call("set_cms_image_alt", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerTool(
    "preflight_navigate_to_finding",
    {
      description: "Open a layer, page, or CMS item in the Framer editor for a finding.",
      inputSchema: {
        nodeId: z.string().optional(),
        pageId: z.string().optional(),
        collectionId: z.string().optional(),
        collectionItemId: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return textResult(await bridge.call("navigate_to_finding", args))
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.registerResource(
    "latest-audit",
    "preflight://audit/latest",
    {
      description: "Latest Preflight audit JSON",
      mimeType: "application/json",
    },
    async () => {
      if (!bridge.isPluginConnected()) {
        return {
          contents: [
            {
              uri: "preflight://audit/latest",
              text: JSON.stringify({ error: "Framer plugin not connected" }),
            },
          ],
        }
      }
      try {
        const audit = await bridge.call("get_latest_audit")
        return {
          contents: [
            {
              uri: "preflight://audit/latest",
              text: JSON.stringify(audit, null, 2),
            },
          ],
        }
      } catch (e) {
        return {
          contents: [
            {
              uri: "preflight://audit/latest",
              text: JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
              }),
            },
          ],
        }
      }
    },
  )
}
