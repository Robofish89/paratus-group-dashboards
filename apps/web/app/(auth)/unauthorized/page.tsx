import { AuthLayout, Button } from "@repo/ui";

export const metadata = {
  title: "No access — Paratus Group Dashboards",
};

export default function UnauthorizedPage() {
  return (
    <AuthLayout
      title="No access"
      description="You don't have access to this dashboard. Contact your administrator if you believe this is a mistake."
    >
      <form action="/api/auth/logout" method="POST" className="flex flex-col gap-3">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </AuthLayout>
  );
}
