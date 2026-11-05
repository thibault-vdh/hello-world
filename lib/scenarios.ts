import { normalize } from "./text";

/** Public scenario metadata. Script text lives server-side only (lib/server/scripts.ts). */
export const SCENARIOS = [
  {
    id: "urgent-payment",
    number: 1,
    title: "Urgent payment",
    blurb: "“I need you to wire a supplier before end of day.”",
    keywords: ["one", "1", "first", "urgent", "payment", "pay", "wire", "money", "transfer", "invoice"],
  },
  {
    id: "mfa-code",
    number: 2,
    title: "MFA code request",
    blurb: "“You’ll get a six-digit code. Read it back to me?”",
    keywords: ["two", "2", "second", "mfa", "code", "codes", "authentication", "login", "verification", "factor"],
  },
  {
    id: "lost-phone",
    number: 3,
    title: "“Lost my phone”",
    blurb: "“My phone died. Text me on this number from now on.”",
    keywords: ["three", "3", "third", "lost", "phone", "text", "new", "number", "dropped", "broken"],
  },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export function isScenarioId(v: unknown): v is ScenarioId {
  return SCENARIOS.some((s) => s.id === v);
}

/** Pick a scenario from free speech: "two", "number three", "the MFA one". */
export function parseScenario(text: string): ScenarioId | null {
  const tokens = normalize(text).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  // Explicit numbers win over topical keywords.
  const numeric: Record<string, ScenarioId> = {
    one: "urgent-payment", "1": "urgent-payment", first: "urgent-payment",
    two: "mfa-code", "2": "mfa-code", second: "mfa-code",
    three: "lost-phone", "3": "lost-phone", third: "lost-phone",
  };
  for (const t of tokens) if (numeric[t]) return numeric[t];
  // "to"/"too" are common mishearings of a lone "two".
  if (tokens.length <= 3 && tokens.some((t) => t === "to" || t === "too")) return "mfa-code";
  let best: ScenarioId | null = null;
  let bestScore = 0;
  for (const s of SCENARIOS) {
    const score = tokens.filter((t) => (s.keywords as readonly string[]).includes(t)).length;
    if (score > bestScore) {
      best = s.id;
      bestScore = score;
    }
  }
  return best;
}
