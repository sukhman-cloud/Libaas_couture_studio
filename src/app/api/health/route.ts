import { NextResponse } from "next/server";

/** Simple liveness probe — useful locally and on Vercel. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "libaas-couture-studio",
    time: new Date().toISOString(),
  });
}
