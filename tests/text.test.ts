import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLine, parseYesNo, spokenToEmail, spokenToPhoneDigits, tokenize } from "../lib/text";
import { parseScenario } from "../lib/scenarios";

const line1 = "I agree to hear an AI clone of my voice. My code is maple 47.";

test("tokenize collapses spoken numbers", () => {
  assert.deepEqual(tokenize("My code is Maple, forty-seven."), ["my", "code", "is", "maple", "47"]);
  assert.deepEqual(tokenize("twenty three"), ["23"]);
});

test("karaoke matching is forgiving but ordered", () => {
  const t = tokenize(line1);
  const half = matchLine(t, tokenize("I agree to hear an A.I. clone of my"));
  assert.ok(half.ratio > 0.5 && half.ratio < 0.8, String(half.ratio));
  assert.equal(half.lastMatched, false);
  const full = matchLine(t, tokenize("uh I agree to hear an ai clone of my voice my code is mapel forty seven"));
  assert.ok(full.ratio >= 0.9, String(full.ratio));
  assert.equal(full.lastMatched, true);
  // Partial word at the end of a partial transcript still counts.
  const p = matchLine(tokenize("the old bicycle"), tokenize("the old bicy"));
  assert.equal(p.highlightCount, 3);
  // Wrong number must not match.
  const wrong = matchLine(t, tokenize("I agree to hear an AI clone of my voice my code is maple 46"));
  assert.equal(wrong.lastMatched, false);
});

test("phone digits from speech", () => {
  assert.equal(spokenToPhoneDigits("plus three two four seven zero one two three four five six"), "+32470123456");
  assert.equal(spokenToPhoneDigits("+32 470 12 34 56"), "+32470123456");
  assert.equal(spokenToPhoneDigits("double oh four four seven seven double one"), "+447711");
  assert.equal(spokenToPhoneDigits("plus one four one five, five five five, twenty three, forty five"), "+14155552345");
  assert.equal(spokenToPhoneDigits("hello"), null);
});

test("yes / no / scenario / email", () => {
  assert.equal(parseYesNo("Yeah, that's right."), "yes");
  assert.equal(parseYesNo("No, that's not right"), "no");
  assert.equal(parseYesNo("hmm"), null);
  assert.equal(parseScenario("Number two please"), "mfa-code");
  assert.equal(parseScenario("the lost phone one"), "urgent-payment"); // "one" wins: explicit numbers first
  assert.equal(parseScenario("lost my phone"), "lost-phone");
  assert.equal(parseScenario("3"), "lost-phone");
  assert.equal(parseScenario("urgent payment"), "urgent-payment");
  assert.equal(spokenToEmail("jane dot doe at acme dot com"), "jane.doe@acme.com");
});
