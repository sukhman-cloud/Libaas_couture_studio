import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-cream-50 px-4 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.4em] text-gold-600">
        404
      </p>
      <h1 className="font-display text-3xl font-semibold text-navy-800 sm:text-4xl">
        This page hasn&apos;t been stitched yet.
      </h1>
      <p className="max-w-md text-sm text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={buttonStyles()}>
        Back to home
      </Link>
    </main>
  );
}
