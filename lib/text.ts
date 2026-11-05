/**
 * Isomorphic text helpers shared by the browser (live karaoke highlighting,
 * phone/yes-no/scenario parsing) and the server (consent code verification).
 * Keep this file free of Node or DOM APIs.
 */

const ONES: Record<string, number> = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

/** Lowercase, strip punctuation, split hyphens, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/[-–—_/]/g, " ")
    .replace(/[^a-z0-9+' ]+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse spoken numbers into digit tokens: "forty seven" -> "47",
 * "twenty" -> "20", "seven" -> "7". `oh` only counts as zero when
 * `allowOh` is set (phone numbers), since it is a real word elsewhere.
 */
export function numberWordsToDigits(tokens: string[], allowOh = false): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in TENS) {
      const next = tokens[i + 1];
      const onesVal = next !== undefined ? ONES[next] : undefined;
      if (onesVal !== undefined && onesVal > 0 && next !== "oh" && next !== "o") {
        out.push(String(TENS[t] + onesVal));
        i++;
      } else {
        out.push(String(TENS[t]));
      }
    } else if (t in TEENS) {
      out.push(String(TEENS[t]));
    } else if (t in ONES && ((t !== "oh" && t !== "o") || allowOh)) {
      out.push(String(ONES[t]));
    } else {
      out.push(t);
    }
  }
  return out;
}

export function tokenize(input: string): string[] {
  const n = normalize(input);
  if (!n) return [];
  return numberWordsToDigits(n.split(" "));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Forgiving word similarity: tolerates small STT/pronunciation slips. */
export function similarWord(target: string, heard: string): boolean {
  if (target === heard) return true;
  // Numbers must match exactly (the consent code depends on it).
  if (/^\d+$/.test(target) || /^\d+$/.test(heard)) return target === heard;
  const maxLen = Math.max(target.length, heard.length);
  if (maxLen <= 3) return levenshtein(target, heard) <= (maxLen === 3 ? 1 : 0);
  // Partial transcripts often end mid-word: "bicy" for "bicycle".
  if (heard.length >= 4 && target.startsWith(heard)) return true;
  const dist = levenshtein(target, heard);
  return dist / maxLen <= 0.34;
}

export interface MatchResult {
  /** Per target token: was it recognised? */
  matched: boolean[];
  /** How many leading words to paint as "spoken" (forgiving: skips gaps). */
  highlightCount: number;
  /** Share of target tokens recognised, 0..1. */
  ratio: number;
  /** True when the final target token was recognised. */
  lastMatched: boolean;
}

/**
 * Greedy in-order alignment of what was heard against the target line.
 * Each target word looks a few heard tokens ahead, so filler words or a
 * mis-recognised word don't derail the rest of the line.
 */
export function matchLine(targetTokens: string[], heardTokens: string[]): MatchResult {
  const matched = new Array<boolean>(targetTokens.length).fill(false);
  let j = 0;
  for (let i = 0; i < targetTokens.length && j < heardTokens.length; i++) {
    const window = i === 0 ? 8 : 4;
    for (let k = j; k < Math.min(heardTokens.length, j + window); k++) {
      if (similarWord(targetTokens[i], heardTokens[k])) {
        matched[i] = true;
        j = k + 1;
        break;
      }
    }
  }
  let last = -1;
  matched.forEach((m, idx) => {
    if (m) last = idx;
  });
  const count = matched.filter(Boolean).length;
  return {
    matched,
    highlightCount: last + 1,
    ratio: targetTokens.length ? count / targetTokens.length : 0,
    lastMatched: matched[matched.length - 1] ?? false,
  };
}

/** Rough similarity of two longer texts (0..1), used server-side. */
export function textCoverage(target: string, heard: string): number {
  return matchLine(tokenize(target), tokenize(heard)).ratio;
}

// ---------------------------------------------------------------------------
// Intent parsing for the voice-driven steps
// ---------------------------------------------------------------------------

const YES = new Set(["yes", "yeah", "yep", "yup", "ya", "yah", "correct", "right", "sure", "affirmative", "exactly", "perfect", "ok", "okay", "si", "oui", "ja"]);
const NO = new Set(["no", "nope", "nah", "wrong", "incorrect", "not", "non", "nee", "nein"]);

export function parseYesNo(text: string): "yes" | "no" | null {
  const tokens = normalize(text).split(" ").filter(Boolean);
  if (tokens.some((t) => NO.has(t))) return "no";
  if (tokens.some((t) => YES.has(t))) return "yes";
  return null;
}

/** Turn a spoken phone number into "+<digits>" (or null). */
export function spokenToPhoneDigits(text: string): string | null {
  const raw = normalize(text).split(" ").filter(Boolean);
  let plus = /^\s*\+/.test(text) || raw.includes("plus") || raw.includes("+");
  const tokens = numberWordsToDigits(raw, true);
  let digits = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if ((t === "double" || t === "triple") && next && /^\d$/.test(next)) {
      digits += next.repeat(t === "double" ? 2 : 3);
      i++;
    } else if (/^\+?\d+$/.test(t)) {
      if (t.startsWith("+")) plus = true;
      digits += t.replace("+", "");
    }
  }
  if (!digits) return null;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    plus = true;
  }
  // We ask people to start with the country code, so assume "+" either way.
  void plus;
  return "+" + digits;
}

export function spokenToEmail(text: string): string {
  return normalize(text)
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+(underscore)\s+/g, "_")
    .replace(/\s+(dash|hyphen)\s+/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
}
