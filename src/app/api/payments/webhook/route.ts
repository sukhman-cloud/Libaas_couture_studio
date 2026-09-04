import { NextResponse } from "next/server";

/**
 * Payment webhook endpoint — FOUNDATION ONLY (Phase 10).
 *
 * No real payment gateway is connected. This route deliberately does NOT
 * parse or trust a request body: there is no provider secret configured to
 * verify a signature against, so accepting arbitrary POSTed JSON here would
 * let anyone forge a "payment succeeded" event. Until a real gateway
 * integration ships (with signature verification wired to that provider's
 * SDK/secret), this endpoint always reports itself unavailable.
 *
 * The internal processing logic this route will eventually call —
 * idempotent by (provider, providerEventId), validated against the payment
 * state machine, never trusting a client-controlled status blindly — is
 * already built and unit-testable at
 * src/server/payments/webhooks.ts#processPaymentWebhookEvent.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "No payment provider is configured. This webhook endpoint is a foundation for a future integration.",
    },
    { status: 501 },
  );
}

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed." },
    { status: 405 },
  );
}
