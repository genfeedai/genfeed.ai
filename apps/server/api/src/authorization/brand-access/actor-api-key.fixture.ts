import type { Mock } from 'vitest';
import { vi } from 'vitest';

/**
 * Stands in for the organization read that `findActorApiKey` uses to find a
 * key through its issuing organization. `findKey` returns the live key (or
 * null); a key may name another `issuedOrganizationId` to model a session
 * acting outside the organization it was issued for. A read that does not
 * ask for keys is a plain organization existence check.
 */
export function organizationIssuerLookup(
  findKey: Mock,
  defaultIssuerId: string,
) {
  return vi.fn(async (args?: { select?: { apiKeys?: unknown } }) => {
    if (!args?.select?.apiKeys) {
      return { id: defaultIssuerId };
    }
    const key = await findKey(args);
    if (!key) {
      return null;
    }
    const { issuedOrganizationId, ...liveKey } = key;
    return {
      id: issuedOrganizationId ?? defaultIssuerId,
      apiKeys: [{ metadata: null, ...liveKey }],
    };
  });
}
