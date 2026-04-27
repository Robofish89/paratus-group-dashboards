"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@repo/ui";
import { loginAction, type LoginActionResult } from "./actions";

const ERROR_MESSAGES: Record<NonNullable<LoginActionResult["error"]>, string> = {
  invalid_input: "Please enter a valid email and password.",
  invalid_credentials: "Email or password is incorrect.",
  no_role:
    "Your account is not yet provisioned. Contact your administrator.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "";

  const [state, formAction, pending] = useActionState<
    LoginActionResult | undefined,
    FormData
  >(loginAction, undefined);

  const errorMessage = state?.error ? ERROR_MESSAGES[state.error] : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@paratus.group"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={72}
          disabled={pending}
        />
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="text-sm text-red-600"
          aria-live="polite"
        >
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
