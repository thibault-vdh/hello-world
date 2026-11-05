/** The read-aloud lines. Line 1 is built per session around the consent code. */
export const CONSENT_PREFIX = "I agree to hear an AI clone of my voice. My code is";

export function consentLine(word: string, num: number): string {
  return `${CONSENT_PREFIX} ${word} ${num}.`;
}

/** Phonetically varied, neutral sentences for clone quality (~5 s each). */
export const QUALITY_LINES = [
  "Every morning, Jack quietly fixes the old bicycle parked beside the bright yellow garage.",
  "Would you rather share warm peaches, fresh plums, or a mug of cocoa on a chilly Thursday evening?",
] as const;
