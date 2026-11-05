import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LINK_SIGNING_SECRET = "x".repeat(40);
process.env.ALLOWED_COUNTRY_CODES = "BE,NL,+44";
process.env.ALLOWED_NUMBERS = "+32470123456";

const { transcriptHasConsent } = await import("../lib/server/pipeline");
const { checkPhone } = await import("../lib/server/phone");
const { signToken, verifyToken } = await import("../lib/server/crypto");
const { encodeWav, decodeWav } = await import("../lib/wav");
const { maskPhone } = await import("../lib/server/log");

test("consent gate requires the statement and this session's code", () => {
  const ok = "I agree to hear an AI clone of my voice. My code is maple 47.";
  assert.equal(transcriptHasConsent(ok, "maple", 47), true);
  assert.equal(transcriptHasConsent("I agree to hear an A.I. clone of my voice, my code is Maple, forty-seven", "maple", 47), true);
  assert.equal(transcriptHasConsent(ok, "maple", 48), false, "wrong number");
  assert.equal(transcriptHasConsent(ok, "falcon", 47), false, "wrong word");
  assert.equal(transcriptHasConsent("maple 47", "maple", 47), false, "statement missing");
  assert.equal(transcriptHasConsent("I agree to hear an AI clone of my voice. My code is maple. Um. 47", "maple", 47), true);
});

test("phone checks: prototype allowlist, countries, line types", () => {
  process.env.PROTOTYPE_MODE = "true";
  const ok = checkPhone("+32470123456");
  assert.equal(ok.ok, true);
  const other = checkPhone("+32470999999");
  assert.equal(other.ok, false);
  assert.equal(!other.ok && other.code, "prototype");
  const country = checkPhone("+33612345678");
  assert.equal(!country.ok && country.code, "country");
  process.env.PROTOTYPE_MODE = "false";
  const premium = checkPhone("+32900123456"); // BE 090x premium rate
  assert.equal(premium.ok, false);
  assert.ok(!premium.ok && ["blocked_type", "not_mobile", "invalid"].includes(premium.code), !premium.ok ? premium.code : "");
  assert.equal(checkPhone("+447911123456").ok, true, "calling-code allowlist (+44)");
  assert.equal(checkPhone("12").ok, false);
  process.env.PROTOTYPE_MODE = "true";
});

test("signed tokens are purpose-bound and expire", () => {
  const t = signToken("confirm", { sid: "abc" }, 60_000);
  assert.equal(verifyToken("confirm", t)?.sid, "abc");
  assert.equal(verifyToken("audio", t), null, "other purpose");
  assert.equal(verifyToken("confirm", t.slice(0, -2) + "AA"), null, "tampered");
  assert.equal(verifyToken("confirm", signToken("confirm", { sid: "abc" }, -1)), null, "expired");
});

test("wav round trip + strict parsing", () => {
  const pcm = new Int16Array(48000).map((_, i) => Math.round(Math.sin(i / 10) * 8000));
  const back = decodeWav(encodeWav(pcm, 48000));
  assert.ok(back);
  assert.equal(back!.sampleRate, 48000);
  assert.equal(back!.samples.length, 48000);
  assert.equal(back!.samples[123], pcm[123]);
  assert.equal(decodeWav(new Uint8Array(100)), null);
});

test("phone masking never shows the full number", () => {
  const m = maskPhone("+32470123456", "32");
  assert.equal(m.startsWith("+32 "), true);
  assert.equal(m.endsWith("56"), true);
  assert.equal(m.includes("470"), false);
});
