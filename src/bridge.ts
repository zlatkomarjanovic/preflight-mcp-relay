import { WebSocket, WebSocketServer } from "ws"
import type { PreflightBridge } from "./bridgeInterface.js"
import { BRIDGE_PORT, type BridgeMessage, type BridgeRequest } from "./protocol.js"

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class FramerBridge implements PreflightBridge {
  private wss: WebSocketServer | null = null
  private plugin: WebSocket | null = null
  private pending = new Map<string, Pending>()

  start(): void {
    if (this.wss) return

    this.wss = new WebSocketServer({ port: BRIDGE_PORT, host: "127.0.0.1" })

    this.wss.on("connection", (socket) => {
      this.plugin = socket
      log(`Framer plugin connected on port ${BRIDGE_PORT}`)

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as BridgeMessage
          if (msg.type === "response") {
            const entry = this.pending.get(msg.id)
            if (!entry) return
            clearTimeout(entry.timer)
            this.pending.delete(msg.id)
            if (msg.ok) entry.resolve(msg.result)
            else entry.reject(new Error(msg.error ?? "Bridge call failed"))
          }
        } catch {
          // ignore malformed
        }
      })

      socket.on("close", () => {
        if (this.plugin === socket) {
          this.plugin = null
          log("Framer plugin disconnected")
        }
      })
    })

    log(`Bridge listening on ws://127.0.0.1:${BRIDGE_PORT}`)
  }

  isPluginConnected(): boolean {
    return this.plugin?.readyState === WebSocket.OPEN
  }

  async call(method: string, params?: unknown, timeoutMs = 120_000): Promise<unknown> {
    if (!this.isPluginConnected()) {
      throw new Error(
        "Framer Preflight plugin is not connected. Open Framer, run the Preflight plugin, and ensure the bridge shows connected.",
      )
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const payload: BridgeRequest = { type: "request", id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Bridge timeout for ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
      this.plugin!.send(JSON.stringify(payload))
    })
  }
}

function log(message: string): void {
  console.error(`[preflight-mcp] ${message}`)
}
