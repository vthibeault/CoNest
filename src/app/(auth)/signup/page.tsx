import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create an account · CoNest" };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" action={signUp} />;
}
