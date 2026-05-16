import type { Request, Response, NextFunction } from "express"

/** Framer plugins call billing APIs from the browser — CORS is required. */
export function preflightCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
  res.setHeader("Access-Control-Max-Age", "86400")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }

  next()
}
