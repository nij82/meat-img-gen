import { redirect } from "next/navigation";
import ThumbnailGeneratorClient from "./thumbnail-generator-client";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  return <ThumbnailGeneratorClient userEmail={user.email ?? ""} />;
}
