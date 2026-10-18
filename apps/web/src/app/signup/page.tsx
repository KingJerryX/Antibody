import { Suspense } from "react";
import { AuthScreen } from "@/components/AuthScreen";

export const metadata = { title: "Sign up | Antibody" };

export default function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return (
    <Suspense fallback={<AuthScreen mode="signup" />}>
      <SignupForm searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupForm({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return <AuthScreen mode="signup" error={error} next={next} />;
}
