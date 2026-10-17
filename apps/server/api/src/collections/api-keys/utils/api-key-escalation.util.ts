import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { SELF_SERVICE_API_KEY_SCOPES } from '@genfeedai/contracts/constants';
import { HttpException, HttpStatus } from '@nestjs/common';

export type RequestedApiKeyReach = {
  allowedIps?: readonly string[] | null;
  expiresAt?: string | null;
  scopes?: readonly string[] | null;
};

function deny(detail: string): never {
  throw new HttpException(
    { detail, title: 'API key privilege escalation' },
    HttpStatus.FORBIDDEN,
  );
}

/**
 * A key authenticating a request may manage other keys (the CLI does), but
 * never with more reach than it has itself: scopes must be a subset of its
 * own, and an IP allowlist or expiry on the caller must carry over.
 *
 * The DTOs are `@IsOptional()`, which lets JSON `null` through. On create
 * `null` means "omitted" (the service falls back to its defaults); on update
 * `undefined` is "unchanged" and `null` is an explicit clear.
 */
export function assertKeyWithinCaller(
  callerKey: Pick<ApiKeyDocument, 'allowedIps' | 'expiresAt' | 'scopes'> | null,
  requested: RequestedApiKeyReach,
  isCreate: boolean,
): void {
  if (!callerKey) {
    deny('The calling API key could not be resolved.');
  }

  const isOmitted = (value: unknown): boolean =>
    isCreate ? value == null : value === undefined;

  const callerScopes = new Set<string>(callerKey.scopes ?? []);
  if (
    (!isCreate && requested.scopes === null) ||
    (Array.isArray(requested.scopes) &&
      requested.scopes.some((scope) => !callerScopes.has(scope)))
  ) {
    deny('An API key cannot grant scopes it does not hold itself.');
  }

  const callerIps = callerKey.allowedIps ?? [];
  if (callerIps.length > 0) {
    const isNarrowed =
      Array.isArray(requested.allowedIps) &&
      requested.allowedIps.length > 0 &&
      requested.allowedIps.every((ip) => callerIps.includes(ip));
    if (isOmitted(requested.allowedIps) ? isCreate : !isNarrowed) {
      deny(
        'An IP-restricted API key can only manage keys restricted to a subset of its IPs.',
      );
    }
  }

  if (callerKey.expiresAt) {
    const callerExpiry = new Date(callerKey.expiresAt).getTime();
    const isWithinCallerExpiry =
      typeof requested.expiresAt === 'string' &&
      new Date(requested.expiresAt).getTime() <= callerExpiry;
    if (isOmitted(requested.expiresAt) ? isCreate : !isWithinCallerExpiry) {
      deny(
        'An expiring API key can only manage keys that expire no later than itself.',
      );
    }
  }
}

/**
 * Omitted scopes mean the service default preset, which a narrower calling
 * key may not hold; cap it at what the caller holds.
 */
export function scopesWithinCaller(
  callerScopes: readonly string[] | undefined,
): string[] {
  return (callerScopes ?? []).filter((scope) =>
    (SELF_SERVICE_API_KEY_SCOPES as readonly string[]).includes(scope),
  );
}

/**
 * Scopes written onto a key take on that key's own IP allowlist and expiry, so
 * when an update changes scopes, the reach to check is what the key ends up
 * with, not just the fields present in the request.
 */
export function updatedKeyReach(
  existingKey: Pick<ApiKeyDocument, 'allowedIps' | 'expiresAt'>,
  requested: RequestedApiKeyReach,
): RequestedApiKeyReach {
  if (requested.scopes === undefined) {
    return requested;
  }

  return {
    ...requested,
    allowedIps:
      requested.allowedIps === undefined
        ? existingKey.allowedIps
        : requested.allowedIps,
    expiresAt:
      requested.expiresAt === undefined
        ? (existingKey.expiresAt?.toISOString() ?? null)
        : requested.expiresAt,
  };
}
