/**
 * Minimal request validation + sanitization.
 * Deliberately dependency-free (no schema library) — the surface it guards is small.
 */

import { AGENT_LANGUAGES, type AgentLanguage, type ApiErrorCode } from "./contracts";

export type FieldIssue = { field: string; message: string };

export class ValidationError extends Error {
  readonly code: ApiErrorCode = "VALIDATION_FAILED";
  constructor(public fields: Record<string, string>) {
    super("Invalid request body");
    this.name = "ValidationError";
  }
}

/** Control characters out, whitespace collapsed, hard length cap. */
export function sanitizeText(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError({ body: "Expected a JSON object." });
  }
  return value as Record<string, unknown>;
}

export function requireString(
  source: Record<string, unknown>,
  field: string,
  { max = 2000, min = 1 }: { max?: number; min?: number } = {}
): string {
  const raw = source[field];
  const value = sanitizeText(raw, max);
  if (!value) throw new ValidationError({ [field]: "Required." });
  if (value.length < min) throw new ValidationError({ [field]: `Too short (min ${min}).` });
  return value;
}

export function optionalString(
  source: Record<string, unknown>,
  field: string,
  max = 2000
): string | undefined {
  if (source[field] === undefined || source[field] === null) return undefined;
  const value = sanitizeText(source[field], max);
  return value.length > 0 ? value : undefined;
}

export function requireLanguage(source: Record<string, unknown>, field = "language"): AgentLanguage {
  const value = sanitizeText(source[field], 8).toLowerCase();
  const match = (AGENT_LANGUAGES as readonly string[]).includes(value)
    ? (value as AgentLanguage)
    : undefined;
  if (!match) {
    throw new ValidationError({ [field]: `Must be one of: ${AGENT_LANGUAGES.join(", ")}.` });
  }
  return match;
}

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

const EMAIL_SHAPE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(value: unknown, field = "email"): string {
  const email = sanitizeText(value, EMAIL_MAX).toLowerCase();
  if (!email) throw new ValidationError({ [field]: "Email is required." });
  if (!EMAIL_SHAPE.test(email)) throw new ValidationError({ [field]: "Enter a valid email address." });
  return email;
}

/**
 * Password policy: length over complexity theatre, and a letter+digit floor so an account
 * cannot be a single repeated character. Checked server-side; the form only previews it.
 */
export function validatePassword(
  value: unknown,
  field = "password",
  { forbid }: { forbid?: string[] } = {}
): string {
  if (typeof value !== "string") throw new ValidationError({ [field]: "Password is required." });
  const password = value.slice(0, PASSWORD_MAX);
  if (password.length < PASSWORD_MIN)
    throw new ValidationError({ [field]: `Use at least ${PASSWORD_MIN} characters.` });
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    throw new ValidationError({ [field]: "Include at least one letter and one number." });
  if (forbid?.some((token) => token.length > 2 && password.toLowerCase().includes(token.toLowerCase())))
    throw new ValidationError({ [field]: "Do not reuse your email or workspace name in the password." });
  return password;
}

export function validateName(value: unknown, field = "name"): string {
  const name = sanitizeText(value, 80);
  if (name.length < 2) throw new ValidationError({ [field]: "Enter your full name." });
  return name;
}

export function slugify(value: string, fallback = "workspace"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[^\p{Ll}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 3 ? slug : fallback;
}

export function requireId(source: Record<string, unknown>, field = "sessionId"): string {
  const value = sanitizeText(source[field], 64);
  if (!/^[A-Za-z0-9_:.-]{4,64}$/.test(value)) {
    throw new ValidationError({ [field]: "Malformed identifier." });
  }
  return value;
}

/** Keys must be slug-like so they can never smuggle a path or query fragment. */
export function requireSlug(value: unknown, field: string): string {
  const slug = sanitizeText(value, 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new ValidationError({ [field]: "Must be a lowercase slug (a–z, 0–9, hyphen)." });
  }
  return slug;
}

export function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of search.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    try {
      const key = decodeURIComponent(k);
      if (key.length <= 40) out[key] = decodeURIComponent(v).slice(0, 200);
    } catch {
      /* ignore malformed pairs rather than throwing at the caller */
    }
  }
  return out;
}
