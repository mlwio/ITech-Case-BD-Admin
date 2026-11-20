/**
 * Password hashing helpers (bcryptjs). Server-only — never import this from a
 * client component or from Edge middleware.
 */

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Generates a readable temporary password for invited teammates and password
 * resets. Uses the Web Crypto CSPRNG (available on Node 18+ and the Edge).
 */
export function generateTemporaryPassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += TEMP_ALPHABET[bytes[index] % TEMP_ALPHABET.length];
  }
  return out;
}
