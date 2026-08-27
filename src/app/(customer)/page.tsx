import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Ruler, Scissors, Sparkles } from "lucide-react";
import { InstagramFeed } from "@/components/social/instagram-feed";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

/**
 * Home — Phase 1 foundation page.
 * Establishes the customer shell, tokens and components. The full home
 * experience (collections, featured products, appointments) arrives with
 * later phases once the catalog exists.
 */
export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy-900 text-cream-50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            // Derived from theme tokens so a palette change updates the hero too.
            background:
              "radial-gradient(60% 60% at 80% 10%, color-mix(in srgb, var(--color-gold-500) 25%, transparent), transparent 70%), radial-gradient(50% 50% at 10% 90%, color-mix(in srgb, var(--color-navy-500) 60%, transparent), transparent 70%)",
          }}
        />
        <div className="container-page relative flex flex-col items-center gap-8 py-20 text-center sm:py-28">
          <Image
            src={siteConfig.assets.logo}
            alt={`${siteConfig.name} logo`}
            width={96}
            height={96}
            priority
            className="size-24 rounded-full ring-2 ring-gold-500/60"
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.4em] text-gold-400">
              {siteConfig.address.line2}, {siteConfig.address.city}
            </p>
            <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-semibold sm:text-5xl lg:text-6xl">
              Stitched with love, draped in{" "}
              <em className="text-gold-400">elegance.</em>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-cream-100/75 sm:text-lg">
              {siteConfig.tagline} — the online home of {siteConfig.name} is
              being tailored right now, phase by phase.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/shop"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Explore the Shop
            </Link>
            <Link
              href="/account"
              className={buttonStyles({
                variant: "outline",
                size: "lg",
                className:
                  "border-cream-100/40 text-cream-50 hover:bg-cream-50/10",
              })}
            >
              Your Account
            </Link>
          </div>
          <Badge tone="gold">Early preview — full boutique coming soon</Badge>
        </div>
      </section>

      {/* ── What's coming ────────────────────────────────────── */}
      <section className="container-page py-14 sm:py-20">
        <h2 className="text-center font-display text-2xl font-semibold text-navy-800 sm:text-3xl">
          Crafted services, coming online
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">
          The boutique experience this application is being built to serve.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Sparkles,
              title: "Couture Catalog",
              text: "Browse designer suits and collections, tailored to you.",
            },
            {
              icon: Ruler,
              title: "Saved Measurements",
              text: "Your measurement profiles, securely on file for every order.",
            },
            {
              icon: Scissors,
              title: "Custom Orders",
              text: "Share reference designs and follow stitching progress.",
            },
            {
              icon: CalendarDays,
              title: "Appointments",
              text: "Book consultations, measurements and fittings online.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="flex flex-col items-start gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-display text-lg font-semibold text-navy-800">
                  {item.title}
                </h3>
                <p className="text-sm text-muted">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Social / Instagram (Phase 6B) ────────────────────── */}
      <section
        aria-labelledby="home-instagram"
        className="border-t border-cream-200 bg-cream-100"
      >
        <div className="container-page flex flex-col items-center py-14 text-center sm:py-20">
          <h2
            id="home-instagram"
            className="font-display text-2xl font-semibold text-navy-800 sm:text-3xl"
          >
            From the studio&apos;s Instagram
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            New work, handwork close-ups and studio updates — straight from
            our feed.
          </p>
          <Link
            href={siteConfig.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold-700 underline underline-offset-4"
          >
            @libaas_couture_studio →
          </Link>

          {/* Renders the live feed when configured; renders nothing (and
              the section stays a simple follow invitation) when the
              integration is off or Instagram is unreachable. Suspense
              streams the rest of the page immediately — even a hanging
              API (8s timeout) can never delay first paint. */}
          <Suspense fallback={null}>
            <InstagramFeed />
          </Suspense>
        </div>
      </section>
    </>
  );
}
