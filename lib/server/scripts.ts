import "server-only";
import type { ScenarioId } from "../scenarios";

/**
 * Fixed call scripts. The client only ever sends a ScenarioId; no request
 * text ever reaches TTS. Written as if the visitor's clone is calling a
 * colleague, so the visitor hears exactly what that colleague would hear.
 */
export const SCRIPTS: Record<ScenarioId, string> = {
  "urgent-payment":
    "Hey, it's me. Sorry, I'm in a real rush, I'm about to walk into a meeting. " +
    "I need you to push an urgent payment to a new supplier before end of day. It's forty-eight thousand euros. " +
    "I'll email you the bank details in a minute. And please keep this between us for now, it's confidential. " +
    "Can you handle that for me? Thanks, you're a lifesaver.",
  "mfa-code":
    "Hi, it's me. I'm locked out of my account and IT is resetting my access right now. " +
    "You're about to get a six-digit code by text message. " +
    "Can you read it back to me as soon as it comes in? It's really urgent, I've got a client call in five minutes.",
  "lost-phone":
    "Hey, it's me. I dropped my phone and the screen is completely dead, so I'm calling from a friend's. " +
    "Can you text me on this number from now on? Don't use my old number for a while, I'll explain later. " +
    "Thanks, talk soon!",
};

export const REVEAL_TEXT =
  "This was an AI clone of your voice, made in under a minute. Learn more at noon dot security.";
