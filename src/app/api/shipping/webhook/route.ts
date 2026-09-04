import { NextResponse } from "next/server";

/**
 * Shipping/carrier webhook endpoint — FOUNDATION ONLY (Phase 11).
 *
 * No real carrier is connected. This route deliberately does NOT parse or
 * trust a request body: there is no carrier secret configured to verify a
 * signature against, so accepting arbitrary POSTed JSON here would let
 * anyone forge a "delivered" event. Until a real carrier integration ships
 * (with signature verification wired to that carrier's SDK/secret), this
 * endpoint always reports itself unavailable.
 *
 * The internal processing logic this route will eventually call —
 * idempotent by (carrier, providerEventId), validated against the
 * shipment state machine, never trusting a client-controlled status
 * blindly — is already built and unit-testable at
 * src/server/shipping/webhooks.ts#processShipmentWebhookEvent.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "No shipping carrier is configured. This webhook endpoint is a foundation for a future integration.",
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
