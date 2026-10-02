import { timingSafeEqual } from "node:crypto";

/** True when no APP_PASSCODE is configured, or the request carries the right one. */
export function checkPasscode(req: Request): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return true;
  const given = req.headers.get("x-passcode") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
