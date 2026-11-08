import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether `supplied` is the proof the MCP adapter sends on every API call: the
 * SHA-256 of the service key both servers share (`GENFEEDAI_API_KEY`). Only the
 * MCP server holds that key, so a match means the request came through it.
 * Fails closed when no service key is configured.
 */
export function isTrustedMcpOriginProof(
  configuredServiceKey: unknown,
  supplied: unknown,
): boolean {
  if (
    typeof configuredServiceKey !== 'string' ||
    configuredServiceKey.length === 0 ||
    typeof supplied !== 'string'
  ) {
    return false;
  }
  const expected = Buffer.from(
    createHash('sha256').update(configuredServiceKey).digest('base64url'),
  );
  // Byte lengths, not string lengths: a non-ASCII header of the same string
  // length would otherwise make timingSafeEqual throw instead of failing.
  const proof = Buffer.from(supplied);
  return expected.length === proof.length && timingSafeEqual(expected, proof);
}
