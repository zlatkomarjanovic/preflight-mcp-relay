import { randomUUID } from "node:crypto"
import type { Request, Response } from "express"
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import type { FramerBridge } from "./bridge.js"
import { createPreflightMcpServer } from "./createServer.js"
import { MCP_HTTP_PORT } from "./protocol.js"

const transports: Record<string, StreamableHTTPServerTransport> = {}

function log(message: string): void {
  console.error(`[preflight-mcp] ${message}`)
}

export async function startHttpMcpServer(bridge: FramerBridge): Promise<void> {
  const app = createMcpExpressApp({ host: "127.0.0.1" })

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId]
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport!
          },
        })
        const server = createPreflightMcpServer(bridge)
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
        return
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        })
        return
      }

      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      log(`HTTP MCP error: ${err instanceof Error ? err.message : String(err)}`)
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
    const sessionId = req.headers["mcp-session-id"] as string | undefined
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID")
      return
    }
    await transports[sessionId].handleRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    app.listen(MCP_HTTP_PORT, "127.0.0.1", (err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })

  log(`HTTP MCP listening at http://127.0.0.1:${MCP_HTTP_PORT}/mcp`)
  log("Keep this terminal open while using Claude Custom Connector.")
}
