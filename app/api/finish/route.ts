import { json, withSession } from "@/lib/server/http";
import { finishSession } from "@/lib/server/pipeline";
import { snapshot } from "@/lib/server/store";

/** Results screen reached: delete clone + audio right away (unless a call is still live). */
export const POST = withSession("finish", { perMinute: 6 }, async (_req, s) => {
  await finishSession(s);
  return json({ ok: true, snapshot: snapshot(s) });
});
