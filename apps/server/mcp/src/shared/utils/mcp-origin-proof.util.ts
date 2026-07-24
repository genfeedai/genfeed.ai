import { createHash } from 'node:crypto';

export function createMcpOriginProof(
  serviceApiKey: string | undefined,
): string | undefined {
  if (!serviceApiKey) {
    return undefined;
  }
  return createHash('sha256').update(serviceApiKey).digest('base64url');
}
