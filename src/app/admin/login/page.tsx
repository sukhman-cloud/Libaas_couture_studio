"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/config/site";
import { loginAdmin, type LoginFormState } from "@/lib/auth/actions";

const initialState: LoginFormState = {};

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(
    loginAdmin,
    initialState,
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-900 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-cream-50 p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src={siteConfig.assets.logo}
            alt={`${siteConfig.name} logo`}
            width={64}
            height={64}
            className="size-16 rounded-full ring-2 ring-gold-500/60"
            priority
          />
          <div>
            <h1 className="font-display text-2xl font-semibold text-navy-800">
              Studio Admin
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-gold-600">
              {siteConfig.shortName} Couture Studio
            </p>
          </div>
        </div>

        <form action={formAction} className="space-y-4" noValidate>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Button type="submit" className="w-full" isLoading={isPending}>
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
