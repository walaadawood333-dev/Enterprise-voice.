/**
 * Validation for the Book a Demo flow.
 * Pure functions that return message KEYS, so the UI layer can render them in
 * English or Arabic without the rules knowing anything about presentation.
 */

import { CONSUMER_EMAIL_DOMAINS } from "@/content/demoForm";

export type DemoFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  industry: string;
  useCase: string;
  volume: string;
  message: string;
  consent: boolean;
  /** Honeypot — must stay empty. Humans never see it. */
  fax_reference: string;
};

export type DemoFieldName = keyof DemoFormValues;
export type DemoErrors = Partial<Record<DemoFieldName, string>>;

export const EMPTY_DEMO_FORM: DemoFormValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  country: "",
  industry: "",
  useCase: "",
  volume: "",
  message: "",
  consent: false,
  fax_reference: "",
};

export const MESSAGE_MAX = 1200;

const NAME_RE = /^[\p{L}][\p{L}\p{M}\s'’.\-]{1,79}$/u;
const PHONE_ALLOWED_RE = /^\+?[0-9\s().\-]{6,24}$/;
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const trim = (v: string) => v.replace(/\s+/g, " ").trim();

export function validateDemoField(field: DemoFieldName, v: DemoFormValues): string | undefined {
  switch (field) {
    case "name": {
      const name = trim(v.name);
      if (!name) return "required";
      if (name.length < 2) return "name.short";
      if (!NAME_RE.test(name)) return "name.chars";
      return undefined;
    }
    case "company": {
      const c = trim(v.company);
      if (!c) return "required";
      if (c.length < 2) return "company.short";
      return undefined;
    }
    case "email": {
      const email = trim(v.email).toLowerCase();
      if (!email) return "required";
      if (email.length > 254) return "email.length";
      if (!EMAIL_RE.test(email)) return "email.format";
      const domain = email.split("@")[1] ?? "";
      if (CONSUMER_EMAIL_DOMAINS.includes(domain)) return "email.free";
      return undefined;
    }
    case "phone": {
      const phone = trim(v.phone);
      if (!phone) return "required";
      if (!PHONE_ALLOWED_RE.test(phone)) return "phone.chars";
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) return "phone.digits";
      if (!phone.startsWith("+") && !/^0/.test(phone)) return "phone.digits";
      return undefined;
    }
    case "country":
      return v.country ? undefined : "country";
    case "industry":
      return v.industry ? undefined : "industry";
    case "useCase":
      return v.useCase ? undefined : "useCase";
    case "volume":
      return v.volume ? undefined : "volume";
    case "message": {
      const m = v.message.trim();
      if (!m) return undefined;
      if (m.length < 10) return "message.short";
      if (m.length > MESSAGE_MAX) return "message.long";
      return undefined;
    }
    case "consent":
      return v.consent ? undefined : "consent";
    default:
      return undefined;
  }
}

export const DEMO_FIELD_ORDER: DemoFieldName[] = [
  "name",
  "company",
  "email",
  "phone",
  "country",
  "industry",
  "useCase",
  "volume",
  "message",
  "consent",
];

export function validateDemoForm(v: DemoFormValues): DemoErrors {
  const errors: DemoErrors = {};
  for (const field of DEMO_FIELD_ORDER) {
    const code = validateDemoField(field, v);
    if (code) errors[field] = code;
  }
  return errors;
}

/** Normalise before shipping: trim strings, collapse whitespace, drop the honeypot. */
export function sanitizeDemoForm(v: DemoFormValues): Omit<DemoFormValues, "fax_reference"> {
  const { fax_reference: _honeypot, ...rest } = v;
  return {
    ...rest,
    name: trim(v.name),
    company: trim(v.company),
    email: trim(v.email).toLowerCase(),
    phone: trim(v.phone).replace(/[()\s.]+/g, (m) => (m === "." ? "." : " ")).replace(/\s{2,}/g, " ").trim(),
    message: v.message.trim().slice(0, MESSAGE_MAX),
  };
}

export const isDemoFormValid = (errors: DemoErrors) => Object.keys(errors).length === 0;
