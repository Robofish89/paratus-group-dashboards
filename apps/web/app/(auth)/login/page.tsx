import { Suspense } from "react";
import { AuthLayout } from "@repo/ui";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — Paratus Group Dashboards",
};

export default function LoginPage() {
  return (
    <AuthLayout
      title="Paratus Group Dashboards"
      description="Sign in to access your dashboard"
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
