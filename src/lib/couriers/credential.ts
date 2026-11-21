/**
 * Pathao credential resolution.
 *
 * Credentials can come from two places:
 *   1. the `CourierCredential` row saved in the Courier API Hub (owner-editable), and
 *   2. the process environment (`PATHAO_CLIENT_ID`, …) for deployments that
 *      inject secrets through Vercel instead of the UI.
 *
 * The stored row always wins field-by-field; the environment only fills what the
 * row is missing, so a partially-filled row never silently disables a working
 * env-provided credential (and vice versa).
 */

import { corePrisma } from "@/lib/prisma";
import type { PathaoEnvironment } from "@/lib/types";

export interface PathaoCredentialValues {
  environment: PathaoEnvironment;
  clientId: string | null;
  clientSecret: string | null;
  username: string | null;
  password: string | null;
  storeId: string | null;
  webhookSecret: string | null;
}

/** The subset of a stored row this module reads. */
interface StoredCredential {
  environment: PathaoEnvironment;
  clientId: string | null;
  clientSecret: string | null;
  username: string | null;
  password: string | null;
  storeId: string | null;
  webhookSecret: string | null;
}

type Env = Record<string, string | undefined>;

/** Blank strings are treated as "not set" so an empty field never wins. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * `PATHAO_ENVIRONMENT` wins; otherwise the environment is derived from
 * `PATHAO_API_BASE` (the sandbox host is `courier-api-sandbox.pathao.com`).
 * Defaults to sandbox so a misconfigured production key is never hit by default.
 */
export function pathaoEnvironmentFromEnv(env: Env = process.env): PathaoEnvironment {
  const explicit = clean(env.PATHAO_ENVIRONMENT)?.toUpperCase();
  if (explicit === "PRODUCTION" || explicit === "SANDBOX") return explicit;

  const base = clean(env.PATHAO_API_BASE)?.toLowerCase() ?? "";
  if (base.includes("sandbox")) return "SANDBOX";
  if (base) return "PRODUCTION";
  return "SANDBOX";
}

export function pathaoCredentialFromEnv(env: Env = process.env): PathaoCredentialValues {
  return {
    environment: pathaoEnvironmentFromEnv(env),
    clientId: clean(env.PATHAO_CLIENT_ID),
    clientSecret: clean(env.PATHAO_CLIENT_SECRET),
    username: clean(env.PATHAO_USERNAME),
    password: clean(env.PATHAO_PASSWORD),
    storeId: clean(env.PATHAO_STORE_ID),
    webhookSecret: clean(env.PATHAO_WEBHOOK_SECRET),
  };
}

/** Stored value → environment value per field. */
export function mergePathaoCredential(
  row: StoredCredential | null | undefined,
  env: Env = process.env,
): PathaoCredentialValues {
  const fromEnv = pathaoCredentialFromEnv(env);
  return {
    environment: row?.environment ?? fromEnv.environment,
    clientId: clean(row?.clientId) ?? fromEnv.clientId,
    clientSecret: clean(row?.clientSecret) ?? fromEnv.clientSecret,
    username: clean(row?.username) ?? fromEnv.username,
    password: clean(row?.password) ?? fromEnv.password,
    storeId: clean(row?.storeId) ?? fromEnv.storeId,
    webhookSecret: clean(row?.webhookSecret) ?? fromEnv.webhookSecret,
  };
}

/**
 * Loads a shop's credential for outbound Pathao calls. `row` is returned
 * alongside so callers can cache tokens on the stored row when it exists.
 */
export async function loadPathaoCredential(shopId: string) {
  const row = await corePrisma.courierCredential.findUnique({ where: { shopId } });
  return { row, credential: mergePathaoCredential(row) };
}
