import type { WebSocket } from "ws"
import type { PreflightBridge } from "./bridgeInterface.js"
import type { BridgeMessage, BridgeRequest } from "./protocol.js"

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One Framer plugin connection for a preflight session id */
export class SessionBridge implements PreflightBridge {
  private plugin: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private framerUserId: string | null = null

  attach(socket: WebSocket): void {
    this.plugin = socket

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as BridgeMessage & {
          type?: string
          framerUserId?: string
        }
        if (msg.type === "register" && msg.framerUserId?.trim()) {
          this.framerUserId = msg.framerUserId.trim()
          return
        }
        if (msg.type !== "response") return
        const entry = this.pending.get(msg.id)
        if (!entry) return
        clearTimeout(entry.timer)
        this.pending.delete(msg.id)
        if (msg.ok) entry.resolve(msg.result)
        else entry.reject(new Error(msg.error ?? "Bridge call failed"))
      } catch {
        // ignore
      }
    })

    socket.on("close", () => {
      if (this.plugin === socket) this.plugin = null
    })
  }

  isPluginConnected(): boolean {
    return this.plugin?.readyState === 1
  }

  getFramerUserId(): string | null {
    return this.framerUserId
  }

  async call(method: string, params?: unknown, timeoutMs = 120_000): Promise<unknown> {
    if (!this.isPluginConnected()) {
      throw new Error(
        "Framer Preflight plugin is not connected. Open Preflight in Framer with this session active.",
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
