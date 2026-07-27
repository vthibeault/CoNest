import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { sendMagicLink, signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in · CoNest" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <AuthForm
      mode="sign-in"
      action={signIn}
      magicLinkAction={sendMagicLink}
      next={next}
      initialError={error}
    />
  );
}
