/**
 * Authentication + organization onboarding service.
 *
 * Register is a real flow: validate → hash password → create Organization → create OWNER user →
 * seed a starter agent → issue a session. Login verifies against the stored digest and returns an
 * identical error for unknown emails and wrong passwords, so accounts cannot be enumerated.
 *
 * There is no shortcut to an authenticated context: protected routes re-derive organizationId
 * from the user row, never from a token claim, header or body field.
 */

import type { AuthResult, AuthSessionDto, OrgRole, UserRow } from "../../shared/contracts";
import { sanitizeText, ValidationError, slugify, validateEmail, validateName, validatePassword } from "../../shared/validate";
import type { Db } from "../db/store";
import { ApiError, type Logger } from "../lib/observability";
import type { AuthBroker } from "../http/auth/broker";

export interface AuthContextExtras {
  userId: string | null;
  organizationId: string;
  role: OrgRole;
  /** Set only when a token or session cookie accompanied the request. */
  tokenPresented?: boolean;
}

type OrganizationLite = AuthSessionDto["organization"];

export function createAuthService(
  db: Db,
  broker: AuthBroker | undefined,
  logger: Logger,
  options: { registrationOpen: boolean }
) {
  const requireBroker = (): AuthBroker => {
    if (!broker) {
      throw new ApiError(
        "AUTH_NOT_CONFIGURED",
        "No authentication broker is configured for this runtime. Sign-in is unavailable here; the public demo continues to work."
      );
    }
    return broker;
  };

  const issue = async (user: UserRow, organization: OrganizationLite) => {
    const signed = await requireBroker().sign({
      sub: user.id,
      organizationId: organization.id,
      role: user.role,
    });
    const session: AuthSessionDto = {
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization,
      issuedAt: new Date().toISOString(),
      expiresAt: signed.expiresAt,
      identitySource: broker?.kind === "demo" ? "demo-local" : "jwt",
    };
    return { session, bearerToken: signed.token };
  };

  /** Unique, readable slug: acme → acme-2 → acme-7 … */
  const uniqueSlug = async (desired: string) => {
    const base = slugify(desired);
    if (!(await db.organizations.slugTaken(base))) return base;
    for (let attempt = 2; attempt < 200; attempt += 1) {
      const candidate = `${base}-${attempt}`;
      if (!(await db.organizations.slugTaken(candidate))) return candidate;
    }
    return `${base}-${Date.now().toString(36).slice(-5)}`;
  };

  const invalidCredentials = () =>
    new ApiError("INVALID_CREDENTIALS", "Email or password is incorrect.");

  return {
    async register(input: {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      organizationName?: unknown;
    }): Promise<AuthResult> {
      if (!options.registrationOpen) {
        throw new ApiError(
          "FORBIDDEN",
          "Self-service registration is closed in this deployment. Ask an administrator to create your workspace."
        );
      }

      const errors: Record<string, string> = {};
      let name = "";
      let email = "";
      let password = "";
      try {
        name = validateName(input.name, "name");
        email = validateEmail(input.email, "email");
        password = validatePassword(input.password, "password", {
          forbid: [email.split("@")[0] ?? ""],
        });
      } catch (error) {
        if (error instanceof ValidationError) Object.assign(errors, error.fields);
        else throw error;
      }
      if (Object.keys(errors).length === 0 && (await db.users.findByEmail(email)))
        errors.email = "That email already has an account.";
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);

      const desiredOrg = sanitizeText(input.organizationName ?? `${name}'s workspace`, 80);
      const organization = await db.organizations.create({
        name: desiredOrg || "My workspace",
        slug: await uniqueSlug(desiredOrg || name),
        status: "trial",
      });

      const user = await db.users.create({
        organizationId: organization.id,
        email,
        name,
        role: "owner",
        status: "active",
      });

      await db.users.setPassword(user.id, await requireBroker().hashPassword(password));

      // A new workspace gets one draft agent, so the studio is never an empty shell.
      await db.agents.create({
        id: `agt_${organization.id.slice(-6)}_starter`,
        organizationId: organization.id,
        name: "CenterAI Enterprise Voice Agent",
        description: "Created with the workspace. Review the prompt, then mark it live.",
        industry: "Banking",
        language: "en",
        voice: "layla-service",
        systemPrompt:
          "You are the CenterAI demonstration agent. Be professional, concise and natural. Never invent customer data, balances, prices or reference numbers, and never quote performance figures.",
        welcomeMessage:
          "Welcome to CenterAI. I can help with balance enquiries, card issues and appointment booking.",
        status: "draft",
      });

      const issued = await issue(user, {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      });

      logger.info("auth_register", {
        organizationId: organization.id,
        userId: user.id,
        role: user.role,
      });

      return { session: issued.session, bearerToken: issued.bearerToken };
    },

    async login(input: { email?: unknown; password?: unknown }): Promise<AuthResult> {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
      if (!email || !password) throw invalidCredentials();

      const credential = await db.users.getCredentialByEmail(email);
      // Equal work either way, so timing does not reveal whether the account exists.
      const verified = credential
        ? await requireBroker().verifyPassword(password, credential.passwordHash)
        : await requireBroker()
            .hashPassword(password || "padding")
            .then(() => false);

      if (!credential || !verified) throw invalidCredentials();
      if (credential.status !== "active")
        throw new ApiError("ACCOUNT_DISABLED", "This account is disabled. Contact your workspace admin.");

      const user = await db.users.get(credential.userId);
      const organization = user ? await db.organizations.get(user.organizationId) : undefined;
      if (!user || !organization) throw invalidCredentials();

      const issued = await issue(user, {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      });

      logger.info("auth_login", { organizationId: organization.id, userId: user.id });
      return { session: issued.session, bearerToken: issued.bearerToken };
    },

    async me(ctx: AuthContextExtras): Promise<AuthSessionDto> {
      // Demo Mode's implicit tenant is a public-surface fallback, not a signed-in session.
      if (!ctx.userId || !ctx.tokenPresented) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "No active session. Sign in to open your workspace."
        );
      }
      const user = await db.users.get(ctx.userId);
      const organization = user ? await db.organizations.get(user.organizationId) : undefined;
      if (!user || !organization)
        throw new ApiError("UNAUTHENTICATED", "Your session is no longer valid.");

      return {
        userId: user.id,
        organizationId: organization.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          status: organization.status,
        },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (broker?.maxAgeSeconds ?? 0) * 1000).toISOString(),
        identitySource: broker?.kind === "demo" ? "demo-local" : "jwt",
      };
    },

    async logout(token: string | null): Promise<{ ok: true }> {
      if (broker?.revoke && token) {
        const claims = await broker.verify(token);
        if (claims) broker.revoke(claims.jti, claims.exp);
      }
      logger.info("auth_logout", {});
      return { ok: true };
    },
  };
}
