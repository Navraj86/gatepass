"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useAuth } from "./auth";
import { Button, Card, Field, Input, Notice } from "./ui";

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "signup") await signUp(String(form.get("name")), email, password);
      else await signIn(email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(
        mode === "login" && errorMessage(err).toLowerCase().includes("invalid")
          ? "Wrong email or password"
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  const other = mode === "login" ? "/signup" : "/login";
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link className="font-medium text-accent" href={`${other}?next=${encodeURIComponent(next)}`}>
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
      <Card>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {mode === "signup" ? (
            <Field label="Name">
              <Input name="name" autoComplete="name" required maxLength={100} />
            </Field>
          ) : null}
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
            <Input
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
            />
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" busy={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
