import type { Request, Response, Router } from "express"
import express from "express"
import {
  createCheckoutSession,
  createPortalSession,
  getStripeForWebhook,
  getSubscriptionStatus,
  syncProFromSubscription,
} from "./stripeService.js"
import { getStripeWebhookSecret, isBillingEnforced } from "./config.js"
import { setProCache } from "./cache.js"

const FRAMER_USER_METADATA_KEY = "framer_user_id"

function billingHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Preflight</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #111; }
    h1 { font-size: 1.25rem; }
    p { color: #444; }
    .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`
}

export function registerBillingWebhook(router: Router): void {
  router.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      if (!isBillingEnforced()) {
        res.status(503).send("Billing not configured")
        return
      }

      const signature = req.headers["stripe-signature"]
      if (!signature || typeof signature !== "string") {
        res.status(400).send("Missing stripe-signature")
        return
      }

      let event
      try {
        event = getStripeForWebhook().webhooks.constructEvent(
          req.body as Buffer,
          signature,
          getStripeWebhookSecret(),
        )
      } catch (err) {
        res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : err}`)
        return
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object
            const framerUserId =
              session.metadata?.[FRAMER_USER_METADATA_KEY] ||
              session.client_reference_id
            if (framerUserId) setProCache(framerUserId, true, null)
            break
          }
          case "customer.subscription.created":
          case "customer.subscription.updated": {
            const sub = event.data.object
            const framerUserId = sub.metadata?.[FRAMER_USER_METADATA_KEY]
            if (framerUserId) syncProFromSubscription(framerUserId, sub)
            break
          }
          case "customer.subscription.deleted": {
            const sub = event.data.object
            const framerUserId = sub.metadata?.[FRAMER_USER_METADATA_KEY]
            if (framerUserId) setProCache(framerUserId, false, null)
            break
          }
          default:
            break
        }
        res.json({ received: true })
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Webhook handler failed",
        })
      }
    },
  )
}

export function registerBillingRoutes(router: Router): void {
  router.get("/api/billing/status", async (req: Request, res: Response) => {
    const framerUserId = String(req.query.framerUserId ?? "").trim()
    if (!framerUserId) {
      res.status(400).json({ error: "framerUserId is required" })
      return
    }
    try {
      const status = await getSubscriptionStatus(framerUserId)
      res.json(status)
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not load subscription status",
      })
    }
  })

  router.post("/api/billing/checkout", async (req: Request, res: Response) => {
    if (!isBillingEnforced()) {
      res.status(503).json({
        error: "Billing is not configured on this server (missing STRIPE_SECRET_KEY).",
      })
      return
    }

    const framerUserId = String(req.body?.framerUserId ?? "").trim()
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : undefined
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined

    if (!framerUserId) {
      res.status(400).json({ error: "framerUserId is required" })
      return
    }

    try {
      const session = await createCheckoutSession({ framerUserId, email, name })
      res.json(session)
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not start checkout",
      })
    }
  })

  router.post("/api/billing/portal", async (req: Request, res: Response) => {
    if (!isBillingEnforced()) {
      res.status(503).json({ error: "Billing is not configured on this server." })
      return
    }

    const framerUserId = String(req.body?.framerUserId ?? "").trim()
    if (!framerUserId) {
      res.status(400).json({ error: "framerUserId is required" })
      return
    }

    try {
      const session = await createPortalSession(framerUserId)
      res.json(session)
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not open billing portal",
      })
    }
  })

  router.get("/billing/success", (_req: Request, res: Response) => {
    res.type("html").send(
      billingHtml(
        "Preflight Pro activated",
        `<p>Your subscription is active. Return to Framer, reopen Preflight, and your Pro features will unlock within a minute.</p>
         <div class="card"><p>If status does not update, click <strong>Refresh</strong> in the Pro section of the plugin.</p></div>`,
      ),
    )
  })

  router.get("/billing/cancel", (_req: Request, res: Response) => {
    res.type("html").send(
      billingHtml(
        "Checkout canceled",
        `<p>No charge was made. You can subscribe anytime from the Preflight plugin in Framer.</p>`,
      ),
    )
  })

  router.get("/billing/portal-return", (_req: Request, res: Response) => {
    res.type("html").send(
      billingHtml(
        "Billing updated",
        `<p>Your subscription changes are saved. Return to Framer and Preflight.</p>`,
      ),
    )
  })
}
