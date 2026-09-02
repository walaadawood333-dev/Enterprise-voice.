/**
 * Prisma client bootstrap.
 *
 * The import is dynamic and the type is structural, so the project compiles before
 * `prisma generate` has ever been run, and a missing/failed generation surfaces as an
 * actionable configuration error instead of an obscure module-not-found.
 */

import { ApiError } from "../../lib/observability";

/** Minimal shape of the six delegates this repository touches. */
export interface PrismaDelegate<TRecord = Record<string, unknown>> {
  findUnique(args: { where: Record<string, unknown> }): Promise<TRecord | null>;
  findFirst(args?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    take?: number;
  }): Promise<TRecord | null>;
  findMany(args?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    take?: number;
  }): Promise<TRecord[]>;
  create(args: { data: Record<string, unknown> }): Promise<TRecord>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<TRecord>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  delete(args: { where: Record<string, unknown> }): Promise<TRecord>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
}

export interface PrismaClientLike {
  organization: PrismaDelegate;
  user: PrismaDelegate;
  agent: PrismaDelegate;
  voiceSession: PrismaDelegate;
  message: PrismaDelegate;
  usageEvent: PrismaDelegate;
  call: PrismaDelegate;
  callEvent: PrismaDelegate;
  $connect?(): Promise<unknown>;
  $disconnect?(): Promise<unknown>;
}

let cached: PrismaClientLike | null = null;

export async function loadPrismaClient(): Promise<PrismaClientLike> {
  if (cached) return cached;
  try {
    const module = (await import(
      /* @vite-ignore */ "@prisma/client"
    )) as unknown as { PrismaClient: new (options?: unknown) => PrismaClientLike };
    const client = new module.PrismaClient({
      // Never log queries here: parameters can carry transcript text.
      log: ["warn", "error"],
    });
    if (typeof client.$connect === "function") await client.$connect();
    cached = client;
    return client;
  } catch (error) {
    throw new ApiError(
      "CONFIG_INVALID",
      "The Postgres driver is unavailable. Install dependencies and run `npx prisma generate`, then apply migrations with `npx prisma migrate deploy`.",
      { internal: (error as Error)?.message }
    );
  }
}
