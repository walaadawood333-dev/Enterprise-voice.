/**
 * Strict, dependency-free sanitization for tenant-controlled visual identity.
 *
 * Branding is rendered as text, image URLs, or a small set of validated tokens. Arbitrary HTML,
 * CSS, font declarations, and style fragments are deliberately not part of the contract.
 */

export interface BrandingData {
  displayName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  theme?: "light" | "dark" | "auto";
}

export interface SanitizedBranding extends BrandingData {
  sanitized: true;
  warnings: string[];
}

export interface BrandingSecurityService {
  sanitizeBranding(data: BrandingData): SanitizedBranding;
  validateUrl(url: string, allowlist?: string[]): boolean;
  validateColor(color: string): boolean;
  sanitizeText(text: string, maxLength?: number): string;
  normalizeColor(color: string): string | undefined;
}

const UNSAFE_BLOCKS =
  /<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu;
const ANY_TAG = /<[^>]*>/gu;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/gu;
const SAFE_NAME_CHARACTERS = /[^\p{L}\p{M}\p{N} .,&()\-–—]/gu;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_COLOR = /^#[0-9a-fA-F]{3}$/;

export function createBrandingSecurityService(): BrandingSecurityService {
  return {
    sanitizeBranding(data) {
      const warnings: string[] = [];
      const sanitized: BrandingData = {};

      if (data.displayName !== undefined) {
        const displayName = this.sanitizeText(data.displayName, 100);
        if (displayName !== data.displayName.trim()) warnings.push("Display name was sanitized");
        sanitized.displayName = displayName;
      }

      for (const key of ["logoUrl", "faviconUrl"] as const) {
        const raw = data[key];
        if (raw === undefined) continue;
        const value = raw.trim();
        if (!value) sanitized[key] = "";
        else if (this.validateUrl(value)) sanitized[key] = value;
        else warnings.push(`${key === "logoUrl" ? "Logo" : "Favicon"} URL is invalid or not allowed`);
      }

      for (const [key, fallback] of [
        ["primaryColor", "#000000"],
        ["accentColor", "#3B82F6"],
      ] as const) {
        const raw = data[key];
        if (raw === undefined) continue;
        const color = this.normalizeColor(raw);
        if (color) sanitized[key] = color;
        else {
          warnings.push(`${key === "primaryColor" ? "Primary" : "Accent"} color is invalid`);
          sanitized[key] = fallback;
        }
      }

      if (data.theme !== undefined) {
        if (["light", "dark", "auto"].includes(data.theme)) sanitized.theme = data.theme;
        else {
          warnings.push("Theme is invalid");
          sanitized.theme = "light";
        }
      }

      return { ...sanitized, sanitized: true, warnings };
    },

    validateUrl(url, allowlist) {
      if (!url || url.length > 2048 || url.search(CONTROL_CHARACTERS) >= 0 || /[<>"'`\\]/u.test(url)) return false;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return false;
        if (allowlist?.length) {
          const host = parsed.hostname.toLowerCase();
          return allowlist.some((entry) => {
            const allowed = entry.toLowerCase();
            return host === allowed || host.endsWith(`.${allowed}`);
          });
        }
        return true;
      } catch {
        return false;
      }
    },

    validateColor(color) {
      return HEX_COLOR.test(color.trim()) || SHORT_HEX_COLOR.test(color.trim());
    },

    normalizeColor(color) {
      const value = color.trim();
      if (HEX_COLOR.test(value)) return value.toLowerCase();
      if (SHORT_HEX_COLOR.test(value)) {
        const [r, g, b] = value.slice(1);
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
      }
      return undefined;
    },

    sanitizeText(text, maxLength = 100) {
      if (typeof text !== "string") return "";
      let value = text.normalize("NFKC");
      // Remove dangerous elements together with their contents before stripping ordinary tags.
      for (let pass = 0; pass < 3; pass += 1) value = value.replace(UNSAFE_BLOCKS, " ");
      value = value
        .replace(/<!--[\s\S]*?-->/gu, " ")
        .replace(ANY_TAG, " ")
        .replace(CONTROL_CHARACTERS, " ")
        .replace(SAFE_NAME_CHARACTERS, "")
        .replace(/\s+/gu, " ")
        .trim();
      return value.slice(0, Math.max(0, maxLength));
    },
  };
}
