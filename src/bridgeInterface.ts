/** Shared bridge API for local FramerBridge and cloud SessionBridge */

export interface PreflightBridge {
  isPluginConnected(): boolean
  call(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
}
