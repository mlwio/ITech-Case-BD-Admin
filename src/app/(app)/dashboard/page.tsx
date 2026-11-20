import { redirect } from "next/navigation";

/** The overview dashboard now lives at the root route — keep old links working. */
export default function DashboardRedirectPage() {
  redirect("/");
}
