import { error, json, withSession } from "@/lib/server/http";
import { chooseScenario } from "@/lib/server/pipeline";
import { isScenarioId } from "@/lib/scenarios";
import { snapshot } from "@/lib/server/store";

/** Client sends only a scenario ID. Script text is server-side and fixed. */
export const POST = withSession("scenario", { perMinute: 6 }, async (req, s) => {
  const body = (await req.json().catch(() => ({}))) as { scenarioId?: unknown };
  if (!isScenarioId(body.scenarioId)) return error("invalid", "Unknown scenario.", 422);
  await chooseScenario(s, body.scenarioId);
  return json({ ok: true, snapshot: snapshot(s) });
});
