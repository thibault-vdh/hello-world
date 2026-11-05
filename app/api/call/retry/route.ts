import { json, withSession } from "@/lib/server/http";
import { retryCall } from "@/lib/server/pipeline";
import { snapshot } from "@/lib/server/store";

/** One retry if the first call wasn't answered. */
export const POST = withSession("retry", { perMinute: 3 }, async (_req, s) => {
  await retryCall(s);
  return json({ ok: true, snapshot: snapshot(s) });
});
