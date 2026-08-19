import type { Prisma } from '../generated/prisma/client/client';

/**
 * Serialize a domain object into Prisma `InputJsonValue`.
 *
 * Json columns reject typed object literals (`nodes`, `config`, `utm`, …).
 * Round-tripping through JSON drops `undefined` keys and maps a missing value
 * to JSON `null`, which is what Prisma persists.
 */
export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
