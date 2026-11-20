/**
 * Pathao Courier Merchant API client.
 *
 * Wraps the `/aladdin/api/v1/*` endpoints used by Phase 3:
 *   POST  issue-token                        → access / refresh tokens
 *   GET   stores                             → pickup stores
 *   POST  orders                             → create a consignment
 *   GET   orders/{consignment_id}/info       → live parcel state
 *   GET   city / city/{id}/zone …            → address mapping
 *
 * Every call throws a `PathaoApiError` carrying Pathao's own validation
 * message (e.g. "invalid phone number") so the UI can surface it verbatim.
 */

import {
  PATHAO_API_BASE,
  PATHAO_DELIVERY_TYPE_NORMAL,
  PATHAO_ITEM_TYPE_PARCEL,
} from "@/lib/constants";
import type { PathaoCity, PathaoEnvironment, PathaoStore, PathaoZone } from "@/lib/types";

/** The credential fields the API client reads — DB rows may hold nulls. */
export interface PathaoCredentialFields {
  environment: PathaoEnvironment;
  clientId: string | null;
  clientSecret: string | null;
  username: string | null;
  password: string | null;
}

export class PathaoApiError extends Error {
  statusCode: number;
  /** Field-level validation messages returned by Pathao. */
  fieldErrors: Record<string, string[]>;

  constructor(message: string, statusCode = 400, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "PathaoApiError";
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export interface PathaoTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export interface PathaoBookingInput {
  storeId: string;
  merchantOrderId: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity: number;
  recipientZone: number;
  recipientArea?: number;
  itemQuantity: number;
  itemWeight: number;
  amountToCollect: number;
  itemDescription: string;
  specialInstruction?: string;
}

export interface PathaoBookingResult {
  consignmentId: string;
  merchantOrderId: string;
  deliveryFee: number;
  pathaoStatus: string;
}

export interface PathaoParcelInfo {
  consignmentId: string;
  merchantOrderId: string | null;
  status: string;
  deliveryFee: number;
  updatedAt: string | null;
  message: string | null;
}

const REQUEST_TIMEOUT_MS = 15_000;

/** True once all four OAuth fields exist — the minimum to call Pathao. */
export function isCredentialConfigured(
  cred: Pick<PathaoCredentialFields, "clientId" | "clientSecret" | "username" | "password">,
): boolean {
  return Boolean(cred.clientId && cred.clientSecret && cred.username && cred.password);
}

/** Pathao only accepts the 11-digit local format (`01XXXXXXXXX`). */
export function normalizePhoneBD(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^880/, "");
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}

/** Pathao rejects numbers it cannot parse — validate before we spend a call. */
export function isValidPhoneBD(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(normalizePhoneBD(phone));
}

function baseUrl(environment: PathaoEnvironment): string {
  return PATHAO_API_BASE[environment] ?? PATHAO_API_BASE.SANDBOX;
}

/** Extracts Pathao's human-readable error message(s) from any response shape. */
function extractError(body: unknown, status: number): PathaoApiError {
  const payload = (body ?? {}) as {
    message?: string;
    error?: string;
    errors?: Record<string, string[] | string>;
  };

  const fieldErrors: Record<string, string[]> = {};
  if (payload.errors && typeof payload.errors === "object") {
    for (const [key, value] of Object.entries(payload.errors)) {
      fieldErrors[key] = Array.isArray(value) ? value : [String(value)];
    }
  }

  const flattened = Object.values(fieldErrors).flat();
  const message =
    flattened[0] ??
    payload.message ??
    payload.error ??
    `Pathao request failed (HTTP ${status})`;

  return new PathaoApiError(message, status, fieldErrors);
}

interface RequestOptions {
  method?: "GET" | "POST";
  token?: string | null;
  body?: unknown;
}

async function pathaoRequest<T>(
  environment: PathaoEnvironment,
  path: string,
  { method = "GET", token, body }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl(environment)}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) throw extractError(json, response.status);
    return json as T;
  } catch (error) {
    if (error instanceof PathaoApiError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new PathaoApiError("Pathao did not respond in time. Please retry.", 504);
    }
    throw new PathaoApiError((error as Error).message || "Network error talking to Pathao", 502);
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

/** `POST /aladdin/api/v1/issue-token` — password grant used at setup time. */
export async function issueToken(cred: PathaoCredentialFields): Promise<PathaoTokens> {
  const json = await pathaoRequest<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>(cred.environment, "/aladdin/api/v1/issue-token", {
    method: "POST",
    body: {
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      username: cred.username,
      password: cred.password,
      grant_type: "password",
    },
  });

  if (!json.access_token) {
    throw new PathaoApiError("Pathao did not return an access token", 502);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
  };
}

/** `POST /aladdin/api/v1/issue-token` with a refresh_token grant. */
export async function refreshToken(
  cred: Pick<PathaoCredentialFields, "environment" | "clientId" | "clientSecret">,
  refresh: string,
): Promise<PathaoTokens> {
  const json = await pathaoRequest<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>(cred.environment, "/aladdin/api/v1/issue-token", {
    method: "POST",
    body: {
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    },
  });

  if (!json.access_token) {
    throw new PathaoApiError("Pathao did not refresh the access token", 502);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refresh,
    expiresIn: json.expires_in ?? 3600,
  };
}

/* -------------------------------------------------------------------------- */
/*  Stores                                                                    */
/* -------------------------------------------------------------------------- */

/** `GET /aladdin/api/v1/stores` — pickup stores (pickup points). */
export async function fetchStores(
  environment: PathaoEnvironment,
  token: string,
): Promise<PathaoStore[]> {
  const json = await pathaoRequest<{
    data?: {
      data?: {
        store_id?: number | string;
        store_name?: string;
        store_address?: string;
        city_name?: string;
        zone_name?: string;
        is_active?: number | boolean;
      }[];
    };
  }>(environment, "/aladdin/api/v1/stores", { token });

  const rows = json.data?.data ?? [];
  return rows.map((row) => ({
    storeId: String(row.store_id ?? ""),
    storeName: row.store_name ?? "Unnamed store",
    storeAddress: row.store_address ?? "",
    cityName: row.city_name ?? "",
    zoneName: row.zone_name ?? "",
    isActive: row.is_active === undefined ? true : Boolean(Number(row.is_active)),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

/** `POST /aladdin/api/v1/orders` — book a single consignment. */
export async function createPathaoOrder(
  environment: PathaoEnvironment,
  token: string,
  input: PathaoBookingInput,
): Promise<PathaoBookingResult> {
  const json = await pathaoRequest<{
    data?: {
      consignment_id?: string | number;
      merchant_order_id?: string;
      delivery_fee?: number | string;
      order_status?: string;
    };
  }>(environment, "/aladdin/api/v1/orders", {
    method: "POST",
    token,
    body: {
      store_id: Number(input.storeId),
      merchant_order_id: input.merchantOrderId,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      recipient_city: input.recipientCity,
      recipient_zone: input.recipientZone,
      ...(input.recipientArea ? { recipient_area: input.recipientArea } : {}),
      delivery_type: PATHAO_DELIVERY_TYPE_NORMAL,
      item_type: PATHAO_ITEM_TYPE_PARCEL,
      item_quantity: input.itemQuantity,
      item_weight: input.itemWeight,
      amount_to_collect: input.amountToCollect,
      item_description: input.itemDescription,
      ...(input.specialInstruction ? { special_instruction: input.specialInstruction } : {}),
    },
  });

  const data = json.data;
  if (!data?.consignment_id) {
    throw new PathaoApiError("Pathao accepted the request but returned no consignment id", 502);
  }

  return {
    consignmentId: String(data.consignment_id),
    merchantOrderId: data.merchant_order_id ?? input.merchantOrderId,
    deliveryFee: Number(data.delivery_fee ?? 0),
    pathaoStatus: data.order_status ?? "Pickup_Requested",
  };
}

/** `GET /aladdin/api/v1/orders/{consignment_id}/info` — live parcel state. */
export async function fetchOrderInfo(
  environment: PathaoEnvironment,
  token: string,
  consignmentId: string,
): Promise<PathaoParcelInfo> {
  const json = await pathaoRequest<{
    data?: {
      consignment_id?: string | number;
      merchant_order_id?: string;
      order_status?: string;
      delivery_fee?: number | string;
      updated_at?: string;
    };
  }>(environment, `/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`, { token });

  const data = json.data ?? {};
  return {
    consignmentId: String(data.consignment_id ?? consignmentId),
    merchantOrderId: data.merchant_order_id ?? null,
    status: data.order_status ?? "In_Transit",
    deliveryFee: Number(data.delivery_fee ?? 0),
    updatedAt: data.updated_at ?? null,
    message: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Locations                                                                 */
/* -------------------------------------------------------------------------- */

export async function fetchCities(environment: PathaoEnvironment, token: string): Promise<PathaoCity[]> {
  const json = await pathaoRequest<{ data?: { data?: { city_id?: number; city_name?: string }[] } }>(
    environment,
    "/aladdin/api/v1/city-list",
    { token },
  );
  return (json.data?.data ?? []).map((row) => ({
    cityId: Number(row.city_id ?? 0),
    cityName: row.city_name ?? "",
  }));
}

export async function fetchZones(
  environment: PathaoEnvironment,
  token: string,
  cityId: number,
): Promise<PathaoZone[]> {
  const json = await pathaoRequest<{ data?: { data?: { zone_id?: number; zone_name?: string }[] } }>(
    environment,
    `/aladdin/api/v1/cities/${cityId}/zone-list`,
    { token },
  );
  return (json.data?.data ?? []).map((row) => ({
    zoneId: Number(row.zone_id ?? 0),
    zoneName: row.zone_name ?? "",
    cityId,
  }));
}
