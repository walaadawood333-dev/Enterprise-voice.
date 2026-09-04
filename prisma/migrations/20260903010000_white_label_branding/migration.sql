-- Authenticated tenant branding. Assets remain external HTTPS references because no
-- production object-storage upload adapter or custom-domain verifier is configured.

CREATE TABLE "organization_branding" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "display_name" TEXT,
  "logo_url" TEXT,
  "favicon_url" TEXT,
  "primary_color" TEXT NOT NULL DEFAULT '#000000',
  "accent_color" TEXT NOT NULL DEFAULT '#3b82f6',
  "theme" TEXT NOT NULL DEFAULT 'light',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_branding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_branding_display_name_check"
    CHECK ("display_name" IS NULL OR char_length("display_name") BETWEEN 1 AND 100),
  CONSTRAINT "organization_branding_logo_url_check"
    CHECK ("logo_url" IS NULL OR "logo_url" ~ '^https://'),
  CONSTRAINT "organization_branding_favicon_url_check"
    CHECK ("favicon_url" IS NULL OR "favicon_url" ~ '^https://'),
  CONSTRAINT "organization_branding_primary_color_check"
    CHECK ("primary_color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "organization_branding_accent_color_check"
    CHECK ("accent_color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "organization_branding_theme_check"
    CHECK ("theme" IN ('light', 'dark', 'auto'))
);

CREATE UNIQUE INDEX "organization_branding_organization_id_key"
  ON "organization_branding"("organization_id");

ALTER TABLE "organization_branding"
  ADD CONSTRAINT "organization_branding_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
