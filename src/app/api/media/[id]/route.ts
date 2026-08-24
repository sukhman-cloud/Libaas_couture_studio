import { NextResponse } from "next/server";
import { getRepositories } from "@/server/data";
import { getStorageProvider } from "@/server/storage";

/**
 * Serves an uploaded media asset by id. Ids are opaque UUIDs generated on
 * upload, and the file is read through the storage abstraction — the
 * request never touches a caller-supplied path.
 *
 * Catalog media is public by design (the customer shop renders it in a
 * later phase); nothing customer-private is ever stored here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const asset = await getRepositories().media.getById(id);
  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await getStorageProvider().read(asset.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(data.byteLength),
        // Content for an id never changes — safe to cache aggressively.
        "Cache-Control": "public, max-age=31536000, immutable",
        // Defence in depth: never sniffed, never scripted, never framed.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
