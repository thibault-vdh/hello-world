import { NextResponse } from "next/server";
import { COOKIE, passwordSet, safeEqual, sessionValue } from "@/lib/auth";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  await new Promise((r) => setTimeout(r, 400)); // slows down guessing
  if (!passwordSet() || typeof b?.password !== "string" || !safeEqual(b.password, process.env.APP_PASSWORD!)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sessionValue(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
