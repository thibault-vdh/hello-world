import "server-only";
import { config } from "./config";
import * as el from "./elevenlabs";
import * as tw from "./twilio";
import { log } from "./log";

/**
 * Thin switch between the real providers and MOCK_PROVIDERS mode. Mock mode
 * never contacts ElevenLabs or Twilio; it exists so the UI can be clicked
 * through locally (and in automated tests) without keys or phone credit.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MockCallHooks {
  onStatus: (status: string, params: { CallDuration?: string }) => void;
}

export const providers = {
  async scribeToken(): Promise<string> {
    if (config.mock) return "mock";
    return el.createRealtimeScribeToken();
  },

  /** In mock mode we pretend the audio said exactly what it should. */
  async transcribe(wav: Uint8Array, mockExpected: string): Promise<string> {
    if (config.mock) {
      await sleep(400);
      return mockExpected;
    }
    return el.transcribe(wav);
  },

  async cloneVoice(wav: Uint8Array, name: string): Promise<string> {
    if (config.mock) {
      await sleep(1500);
      return `mock_${name}`;
    }
    return el.createVoiceClone(wav, name);
  },

  async synthesize(voiceId: string, text: string, clone: boolean): Promise<Buffer> {
    if (config.mock) {
      await sleep(900);
      return Buffer.alloc(0);
    }
    return el.synthesize(voiceId, text, { clone });
  },

  async deleteVoice(voiceId: string): Promise<void> {
    if (config.mock) return;
    await el.deleteVoice(voiceId);
  },

  async sendSms(to: string, body: string, mockLink: string): Promise<void> {
    if (config.mock) {
      log.info("mock.sms", { note: `confirm link: ${mockLink}` });
      return;
    }
    await tw.sendSms(to, body);
  },

  async placeCall(opts: { to: string; twimlUrl: string; statusUrl: string; attempt: number }, hooks: MockCallHooks): Promise<string> {
    if (config.mock) {
      const missFirst = process.env.MOCK_CALL_OUTCOME === "no-answer" && opts.attempt === 1;
      const timeline: [number, string][] = missFirst
        ? [[800, "ringing"], [6000, "no-answer"]]
        : [[800, "ringing"], [3500, "in-progress"], [14000, "completed"]];
      for (const [at, status] of timeline) {
        setTimeout(() => hooks.onStatus(status, status === "completed" ? { CallDuration: "11" } : {}), at);
      }
      return `CAmock${Date.now()}`;
    }
    return tw.placeCall(opts);
  },
};
