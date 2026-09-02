/**
 * Branding Security Service — Phase 20
 * 
 * Provides safe branding handling with:
 * - XSS prevention
 * - URL validation
 * - Color validation
 * - Content sanitization
 * - Injection protection
 */

/**
 * Branding data
 */
export interface BrandingData {
  displayName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  theme?: "light" | "dark";
}

/**
 * Sanitized branding data
 */
export interface SanitizedBranding extends BrandingData {
  sanitized: true;
  warnings: string[];
}

/**
 * Branding security service
 */
export interface BrandingSecurityService {
  sanitizeBranding(data: BrandingData): SanitizedBranding;
  validateUrl(url: string, allowlist?: string[]): boolean;
  validateColor(color: string): boolean;
  sanitizeText(text: string, maxLength?: number): string;
}

/**
 * Create branding security service
 */
export function createBrandingSecurityService(): BrandingSecurityService {
  return {
    sanitizeBranding(data: BrandingData): SanitizedBranding {
      const warnings: string[] = [];
      const sanitized: BrandingData = {};

      if (data.displayName !== undefined) {
        const sanitizedName = this.sanitizeText(data.displayName, 100);
        if (sanitizedName !== data.displayName) {
          warnings.push("Display name was sanitized");
        }
        sanitized.displayName = sanitizedName;
      }

      if (data.logoUrl !== undefined) {
        if (data.logoUrl && !this.validateUrl(data.logoUrl)) {
          warnings.push("Logo URL is invalid or not allowed");
          sanitized.logoUrl = undefined;
        } else {
          sanitized.logoUrl = data.logoUrl;
        }
      }

      if (data.faviconUrl !== undefined) {
        if (data.faviconUrl && !this.validateUrl(data.faviconUrl)) {
          warnings.push("Favicon URL is invalid or not allowed");
          sanitized.faviconUrl = undefined;
        } else {
          sanitized.faviconUrl = data.faviconUrl;
        }
      }

      if (data.primaryColor !== undefined) {
        if (data.primaryColor && !this.validateColor(data.primaryColor)) {
          warnings.push("Primary color is invalid");
          sanitized.primaryColor = "#000000";
        } else {
          sanitized.primaryColor = data.primaryColor;
        }
      }

      if (data.accentColor !== undefined) {
        if (data.accentColor && !this.validateColor(data.accentColor)) {
          warnings.push("Accent color is invalid");
          sanitized.accentColor = "#3b82f6";
        } else {
          sanitized.accentColor = data.accentColor;
        }
      }

      if (data.theme !== undefined) {
        if (data.theme !== "light" && data.theme !== "dark") {
          warnings.push("Theme must be 'light' or 'dark'");
          sanitized.theme = "light";
        } else {
          sanitized.theme = data.theme;
        }
      }

      return { ...sanitized, sanitized: true, warnings };
    },

    validateUrl(url: string, allowlist?: string[]): boolean {
      if (!url) return false;

      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return false;
        }

        if (url.toLowerCase().startsWith("javascript:") || url.toLowerCase().startsWith("data:")) {
          return false;
        }

        const xssPatterns = [
          /<script/i,
          /javascript:/i,
          /on\w+\s*=/i,
          /eval\s*\(/i,
          /expression\s*\(/i,
          /vbscript:/i,
          /livescript:/i,
        ];

        for (const pattern of xssPatterns) {
          if (pattern.test(url)) {
            return false;
          }
        }

        if (allowlist && allowlist.length > 0) {
          const hostname = parsed.hostname;
          return allowlist.some((allowed) => hostname === allowed || hostname.endsWith("." + allowed));
        }

        return true;
      } catch {
        return false;
      }
    },

    validateColor(color: string): boolean {
      if (!color) return false;

      const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (hexPattern.test(color)) return true;

      const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;
      if (rgbPattern.test(color)) return true;

      const namedColors = ["black", "white", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey"];
      if (namedColors.includes(color.toLowerCase())) return true;

      return false;
    },

    sanitizeText(text: string, maxLength?: number): string {
      if (!text) return "";

      let sanitized = text.replace(/<[^>]*>/g, "");
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
      sanitized = sanitized.replace(/javascript:/gi, "");
      sanitized = sanitized.replace(/[<>"'`]/g, "");
      sanitized = sanitized.trim();

      if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }

      return sanitized;
    },
  };
}
