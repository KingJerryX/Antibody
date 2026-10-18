import { Suspense } from "react";
import { AuthScreen } from "@/components/AuthScreen";

export const metadata = { title: "Log in | Antibody" };

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return (
    <Suspense fallback={<AuthScreen mode="login" />}>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginForm({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return <AuthScreen mode="login" error={error} next={next} />;
}
