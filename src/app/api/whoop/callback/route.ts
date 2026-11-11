import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthed, passwordSet } from "@/lib/auth";
import { exchangeCode, whoopConfigured } from "@/lib/whoop";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const q = new URL(req.url).searchParams;
  const expected = (await cookies()).get("whoop_state")?.value;
  const fail = (why: string) => NextResponse.redirect(`${base}/?whoop=${why}`);
  if (!whoopConfigured() || !passwordSet() || !(await isAuthed())) return fail("denied");
  if (!q.get("code") || !expected || q.get("state") !== expected) return fail("failed");
  try {
    await exchangeCode(q.get("code")!, `${base}/api/whoop/callback`);
  } catch {
    return fail("failed");
  }
  const res = NextResponse.redirect(`${base}/?whoop=connected`);
  res.cookies.delete("whoop_state");
  return res;
}
