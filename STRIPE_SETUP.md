# Stripe setup for Preflight Pro ($9/month)

## 1. Create the product in Stripe

1. Open [Stripe Dashboard](https://dashboard.stripe.com/) → **Product catalog** → **Add product**.
2. Name: `Preflight Pro`
3. Pricing: **Recurring** → **$9.00 USD** → **Monthly**
4. Save and copy the **Price ID** (starts with `price_`).

## 2. API keys

1. **Developers** → **API keys**
2. Copy **Secret key** (`sk_live_...` or `sk_test_...` for testing).

## 3. Customer portal (manage / cancel)

1. **Settings** → **Billing** → **Customer portal**
2. Enable the portal and allow customers to cancel subscriptions.

## 4. Webhook

1. **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL:
   ```
   https://preflight-mcp-relay.onrender.com/api/billing/webhook
   ```
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`).

## 5. Render environment variables

In your Render service for `preflight-mcp-relay`, set:

| Variable | Example |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_ID` | `price_...` |
| `PREFLIGHT_PUBLIC_URL` | `https://preflight-mcp-relay.onrender.com` |

`RENDER_EXTERNAL_URL` is set automatically on Render and used if `PREFLIGHT_PUBLIC_URL` is missing.

Redeploy after saving. Verify: `GET https://preflight-mcp-relay.onrender.com/health` should return `"billing": true`.

## 6. Test mode

Use `sk_test_...`, a test `price_...`, and Stripe CLI or a test webhook endpoint while developing:

```bash
stripe listen --forward-to localhost:8080/api/billing/webhook
```

Set `PREFLIGHT_BILLING_ENFORCE=0` on the relay to treat everyone as Pro (local dev only).

## 7. Plugin build

Production plugin builds must include:

```
VITE_MCP_PUBLIC_URL=https://preflight-mcp-relay.onrender.com
```

Billing API calls use that URL. Without it, the plugin runs in “billing off” mode (all features unlocked).

## 8. Flow for users

1. Open Preflight in Framer → **Upgrade** → Stripe Checkout in browser.
2. After payment, return to Framer → **Refresh** in the Pro bar.
3. **Manage** opens Stripe Customer Portal (cancel, update card).

Subscriptions are tied to the Framer user id from `framer.getCurrentUser().id`.
