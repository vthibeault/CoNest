import { redirect } from "next/navigation";

// The root path never renders anything of its own; /calendar owns the session
// check and sends you to onboarding or login as needed.
export default function Home() {
  redirect("/calendar");
}
