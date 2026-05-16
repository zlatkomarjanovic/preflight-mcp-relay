import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import type { IncomingMessage } from "node:http"
import type { Request, Response } from "express"
import express from "express"
import { isBillingEnforced } from "./billing/config.js"
import { registerBillingRoutes, registerBillingWebhook } from "./billing/routes.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { WebSocketServer } from "ws"
import { createPreflightMcpServer } from "./createServer.js"
import { SessionBridge } from "./sessionBridge.js"

const preflightSessions = new Map<string, SessionBridge>()
const mcpTransports = new Map<string, StreamableHTTPServerTransport>()

function log(message: string): void {
  console.error(`[preflight-relay] ${message}`)
}

function getPreflightSession(req: Request): string | null {
  const q = req.query.session
  if (typeof q === "string" && q.trim()) return q.trim()
  const header = req.headers["x-preflight-session"]
  if (typeof header === "string" && header.trim()) return header.trim()
  return null
}

function getOrCreatePreflightSession(id: string): SessionBridge {
  let bridge = preflightSessions.get(id)
  if (!bridge) {
    bridge = new SessionBridge()
    preflightSessions.set(id, bridge)
  }
  return bridge
}

function mcpTransportKey(preflightSession: string, mcpSessionId: string): string {
  return `${preflightSession}:${mcpSessionId}`
}

export async function startCloudRelay(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080)
  const app = express()

  registerBillingWebhook(app)
  app.use(express.json({ limit: "4mb" }))
  registerBillingRoutes(app)

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "preflight-mcp-relay",
      billing: isBillingEnforced(),
    })
  })

  app.post("/mcp", async (req: Request, res: Response) => {
    const preflightSession = getPreflightSession(req)
    if (!preflightSession) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing ?session= query (from Preflight plugin)" },
        id: null,
      })
      return
    }

    const bridge = getOrCreatePreflightSession(preflightSession)

    try {
      const mcpSessionId = req.headers["mcp-session-id"] as string | undefined
      let transport: StreamableHTTPServerTransport | undefined

      if (mcpSessionId) {
        transport = mcpTransports.get(mcpTransportKey(preflightSession, mcpSessionId))
        if (!transport) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Unknown MCP session" },
            id: null,
          })
          return
        }
      } else if (isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            mcpTransports.set(mcpTransportKey(preflightSession, id), transport!)
          },
        })
        const server = createPreflightMcpServer(bridge)
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
        return
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid MCP session" },
          id: null,
        })
        return
      }

      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      log(`MCP error [${preflightSession}]: ${err instanceof Error ? err.message : String(err)}`)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      }
    }
  })

  app.get("/mcp", async (req: Request, res: Response) => {
    const preflightSession = getPreflightSession(req)
    const mcpSessionId = req.headers["mcp-session-id"] as string | undefined
    if (!preflightSession || !mcpSessionId) {
      res.status(400).send("Missing session")
      return
    }
    const transport = mcpTransports.get(mcpTransportKey(preflightSession, mcpSessionId))
    if (!transport) {
      res.status(400).send("Invalid session")
      return
    }
    await transport.handleRequest(req, res)
  })

  const httpServer = createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: "/bridge" })

  wss.on("connection", (socket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost")
      const session = url.searchParams.get("session")?.trim()
      if (!session) {
        socket.close(4400, "Missing ?session=")
        return
      }
      const bridge = getOrCreatePreflightSession(session)
      bridge.attach(socket)
      log(`Plugin connected session=${session}`)
      socket.on("close", () => log(`Plugin disconnected session=${session}`))
    } catch {
      socket.close(1011, "Bridge error")
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })

  log(`Relay listening on port ${port}`)
  log(`MCP URL pattern: https://YOUR_HOST/mcp?session=SESSION_ID`)
  log(`Plugin bridge: wss://YOUR_HOST/bridge?session=SESSION_ID`)
}
