export const PRO_PRICE_DISPLAY = "$9/month"

export function isBillingEnforced(): boolean {
  if (process.env.PREFLIGHT_BILLING_ENFORCE === "0") return false
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
  return key
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured")
  return secret
}

export function getStripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID?.trim()
  if (!id) throw new Error("STRIPE_PRICE_ID is not configured")
  return id
}

export function getPublicBaseUrl(): string {
  const url =
    process.env.PREFLIGHT_PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://localhost:8080"
  return url.replace(/\/$/, "")
}
