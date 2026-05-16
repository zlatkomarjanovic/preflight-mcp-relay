import Stripe from "stripe"
import {
  getPublicBaseUrl,
  getStripePriceId,
  getStripeSecretKey,
  isBillingEnforced,
} from "./config.js"
import { getProCache, setProCache } from "./cache.js"

let stripeClient: Stripe | null = null

function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey())
  }
  return stripeClient
}

const FRAMER_USER_METADATA_KEY = "framer_user_id"

export interface SubscriptionStatus {
  pro: boolean
  billingEnforced: boolean
  currentPeriodEnd: string | null
  customerId: string | null
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const fromItem = sub.items.data[0]?.current_period_end
  if (fromItem) return fromItem
  const legacy = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end
  return legacy ?? null
}

function statusFromSubscription(
  sub: Stripe.Subscription | null,
  billingEnforced: boolean,
): SubscriptionStatus {
  const active =
    !billingEnforced ||
    Boolean(
      sub &&
        (sub.status === "active" ||
          sub.status === "trialing" ||
          (sub.status === "past_due" && sub.cancel_at_period_end === false)),
    )

  const periodEnd = sub ? subscriptionPeriodEnd(sub) : null

  return {
    pro: active,
    billingEnforced,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    customerId:
      typeof sub?.customer === "string" ? sub.customer : sub?.customer?.id ?? null,
  }
}

async function findCustomerByFramerUserId(
  framerUserId: string,
): Promise<Stripe.Customer | null> {
  const result = await stripe().customers.search({
    query: `metadata['${FRAMER_USER_METADATA_KEY}']:'${framerUserId}'`,
    limit: 1,
  })
  const customer = result.data[0]
  return customer && !("deleted" in customer && customer.deleted) ? customer : null
}

async function findActiveSubscription(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const priceId = getStripePriceId()
  const subs = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  })

  for (const sub of subs.data) {
    const matchesPrice = sub.items.data.some((item) => item.price.id === priceId)
    if (!matchesPrice) continue
    if (
      sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due"
    ) {
      return sub
    }
  }
  return null
}

export async function getSubscriptionStatus(
  framerUserId: string,
): Promise<SubscriptionStatus> {
  const billingEnforced = isBillingEnforced()
  if (!billingEnforced) {
    return {
      pro: true,
      billingEnforced: false,
      currentPeriodEnd: null,
      customerId: null,
    }
  }

  const cached = getProCache(framerUserId)
  if (cached && Date.now() - cached.updatedAt < 60_000) {
    return {
      pro: cached.active,
      billingEnforced: true,
      currentPeriodEnd: cached.currentPeriodEnd
        ? new Date(cached.currentPeriodEnd).toISOString()
        : null,
      customerId: null,
    }
  }

  const customer = await findCustomerByFramerUserId(framerUserId)
  if (!customer) {
    setProCache(framerUserId, false, null)
    return {
      pro: false,
      billingEnforced: true,
      currentPeriodEnd: null,
      customerId: null,
    }
  }

  const sub = await findActiveSubscription(customer.id)
  const status = statusFromSubscription(sub, true)
  const periodEnd = sub ? subscriptionPeriodEnd(sub) : null
  setProCache(framerUserId, status.pro, periodEnd ? periodEnd * 1000 : null)
  return { ...status, customerId: customer.id }
}

export async function isProUser(framerUserId: string | null): Promise<boolean> {
  if (!framerUserId) return !isBillingEnforced()
  const status = await getSubscriptionStatus(framerUserId)
  return status.pro
}

export async function createCheckoutSession(input: {
  framerUserId: string
  email?: string
  name?: string
}): Promise<{ url: string }> {
  const base = getPublicBaseUrl()
  let customer = await findCustomerByFramerUserId(input.framerUserId)

  if (!customer) {
    customer = await stripe().customers.create({
      email: input.email,
      name: input.name,
      metadata: { [FRAMER_USER_METADATA_KEY]: input.framerUserId },
    })
  } else if (input.email && !customer.email) {
    await stripe().customers.update(customer.id, { email: input.email })
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: getStripePriceId(), quantity: 1 }],
    success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing/cancel`,
    client_reference_id: input.framerUserId,
    metadata: { [FRAMER_USER_METADATA_KEY]: input.framerUserId },
    subscription_data: {
      metadata: { [FRAMER_USER_METADATA_KEY]: input.framerUserId },
    },
    allow_promotion_codes: true,
  })

  if (!session.url) throw new Error("Stripe did not return a checkout URL")
  return { url: session.url }
}

export async function createPortalSession(framerUserId: string): Promise<{ url: string }> {
  const customer = await findCustomerByFramerUserId(framerUserId)
  if (!customer) {
    throw new Error("No billing account found. Subscribe to Preflight Pro first.")
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: customer.id,
    return_url: getPublicBaseUrl() + "/billing/portal-return",
  })

  return { url: session.url }
}

export function syncProFromSubscription(
  framerUserId: string,
  sub: Stripe.Subscription,
): void {
  const active =
    sub.status === "active" ||
    sub.status === "trialing" ||
    sub.status === "past_due"
  const periodEnd = subscriptionPeriodEnd(sub)
  setProCache(framerUserId, active, periodEnd ? periodEnd * 1000 : null)
}

export function getStripeForWebhook(): Stripe {
  return stripe()
}
