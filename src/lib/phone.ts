// Convert a phone number into a synthetic email used internally for Supabase auth.
// This is a temporary approach until real SMS OTP is wired up.
export function phoneToEmail(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d]/g, "");
  return `phone${digits}@mamnoon.app`;
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  // assume Iraq default +964 if 10 digits starting with 0
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.startsWith("964")) return "+" + digits;
  if (digits.startsWith("0")) return "+964" + digits.slice(1);
  return "+" + digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  return /^\+\d{8,15}$/.test(n);
}
