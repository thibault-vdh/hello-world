import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { isDate, loadState } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const today = q.get("today");
  if (!isDate(today)) return NextResponse.json({ error: "Missing date" }, { status: 400 });
  return NextResponse.json(await loadState(today, q.get("sync") === "1"));
}
