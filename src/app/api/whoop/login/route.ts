import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthed, passwordSet } from "@/lib/auth";
import { authorizeUrl, whoopConfigured } from "@/lib/whoop";

export const dynamic = "force-dynamic";

const origin = (req: Request) => process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;

export async function GET(req: Request) {
  // Real health data is only ever connected to a password-protected app.
  if (!whoopConfigured() || !passwordSet() || !(await isAuthed())) return NextResponse.redirect(`${origin(req)}/`);
  const state = randomBytes(12).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(`${origin(req)}/api/whoop/callback`, state));
  res.cookies.set("whoop_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
