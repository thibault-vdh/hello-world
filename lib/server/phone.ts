import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { config } from "./config";

export type PhoneCheck =
  | { ok: true; e164: string; region: string; callingCode: string }
  | { ok: false; code: string; message: string };

/** Line types we refuse: premium/shared-cost, toll-free, VoIP, pagers, etc. */
const BLOCKED_TYPES = new Set(["PREMIUM_RATE", "SHARED_COST", "TOLL_FREE", "VOIP", "UAN", "PAGER", "VOICEMAIL", "PERSONAL_NUMBER"]);
const SMS_CAPABLE = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

export function checkPhone(input: unknown): PhoneCheck {
  if (typeof input !== "string" || input.length > 32) {
    return { ok: false, code: "invalid", message: "That doesn’t look like a phone number." };
  }
  const pn = parsePhoneNumberFromString(input.startsWith("+") ? input : `+${input}`);
  if (!pn || !pn.isValid()) {
    return { ok: false, code: "invalid", message: "That doesn’t look like a complete number. Start with the country code." };
  }
  const e164 = pn.number;
  const region = pn.country ?? "";
  const callingCode = pn.countryCallingCode;

  const allowed = config.allowedCountryCodes.some((c) => {
    const cc = c.replace(/^\+/, "");
    return /^\d+$/.test(cc) ? cc === callingCode : c.toUpperCase() === region;
  });
  if (!allowed) {
    return { ok: false, code: "country", message: "Sorry, this demo isn’t available for numbers in that country yet." };
  }

  const allowlisted = config.allowedNumbers.includes(e164);
  const type = pn.getType();
  if (type && BLOCKED_TYPES.has(type)) {
    return { ok: false, code: "blocked_type", message: "We can only call regular mobile numbers." };
  }
  if (!allowlisted && (!type || !SMS_CAPABLE.has(type))) {
    return { ok: false, code: "not_mobile", message: "Please use a mobile number. We need to text you a link." };
  }
  if (config.prototypeMode && !allowlisted) {
    return { ok: false, code: "prototype", message: "This prototype only calls pre-approved numbers. Ask the Noon team to add yours." };
  }
  return { ok: true, e164, region, callingCode };
}
