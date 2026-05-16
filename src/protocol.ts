/** Shared bridge protocol between MCP server and Framer Preflight plugin */

export const BRIDGE_PORT = 3847

/** Streamable HTTP MCP endpoint (Claude Desktop custom connector) */
export const MCP_HTTP_PORT = 3848

export type BridgeRequest = {
  type: "request"
  id: string
  method: string
  params?: unknown
}

export type BridgeResponse = {
  type: "response"
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

export type BridgeRegister = {
  type: "register"
  plugin: "preflight"
  version: string
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeRegister

export const BRIDGE_METHODS = [
  "run_scan",
  "get_latest_audit",
  "list_audit_history",
  "get_findings",
  "set_image_alt",
  "set_link",
  "set_page_seo",
  "set_cms_text_field",
  "set_cms_image_alt",
  "navigate_to_finding",
] as const

export type BridgeMethod = (typeof BRIDGE_METHODS)[number]
