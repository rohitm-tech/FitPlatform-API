# Accepted-package payments

Collection is disabled until merchant configuration is supplied. The user chose payment after coach acceptance. Sending or accepting a request does not collect money or grant coaching access.

## Configure a test merchant

Set these names in the backend's ignored `.env`; never place the secret values in the frontend:

```dotenv
PAYMENTS_ENABLED=false
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Use a matching Razorpay test key pair and configure the merchant's capture settings. Configure a publicly reachable HTTPS webhook at `/api/v1/payments/webhook` for `payment.captured`, `order.paid` and `payment.failed`, with its own webhook secret. Localhost cannot receive remote delivery; use an explicitly configured development HTTPS endpoint. Set `PAYMENTS_ENABLED=true` after test configuration is complete and restart the API. `/payments/configuration` reports disabled/test/live to authenticated clients. A valid prefix and all three settings are required; this check does not validate credentials with Razorpay.

Create or use an approved package, send an athlete request, accept as its provider, and open the accepted request as the athlete. Checkout uses the server's saved amount/currency/order. For a test merchant, use Razorpay's documented test methods and verify that the API record becomes captured and fulfilled. Test cancelled/failed attempts, delayed capture, a closed browser, webhook redelivery and an interrupted provider response before using live credentials. Automated tests use mocked gateway responses; no real or test gateway charge has been run in this workspace because credentials are absent.

## What is enforced

- One payment record per accepted request, owner-scoped checkout and immutable request-price snapshots. Client amounts are ignored.
- Stored order IDs, server HMAC verification and provider-side capture verification. An authorised payment remains processing.
- Raw-body webhook signatures and replay-safe fulfilment. Failure events cannot undo capture.
- Ambiguous order creation requires merchant reconciliation instead of a second charge attempt. Admins can bind a matching receipt/amount/currency from Payment records; participants can refresh a bound order.
- A captured payment with a withdrawn offering or changed access is recorded as needing review, without granting coaching access.
- Demo listings cannot collect live money. Genuine listings need provider role approval and admin publication.

## Commercial boundaries

This is a single accepted-package payment integration. A monthly label means its first period only; automatic renewals and expiry enforcement are not implemented. Provider delivery is arranged outside the app for plans/goods/meals. The integration does not implement Route payouts, split settlement, tax invoices, shipping, automatic refunds or subscriptions. Merchant settlements/refunds are handled through the merchant dashboard. Payment support requests notify platform admins; they do not issue refunds. Completed transaction history requires support-assisted account closure.

## Provider references

- [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Create an order](https://razorpay.com/docs/api/orders/create/)
- [Validate and test webhooks](https://razorpay.com/docs/webhooks/validate-test/)

The implementation calls the REST API from the server and loads the official Checkout script only when an athlete explicitly starts checkout. Secrets never enter checkout options or API responses.
