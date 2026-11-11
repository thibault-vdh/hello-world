import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import App from "./app";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAuthed())) redirect("/login");
  return <App />;
}
