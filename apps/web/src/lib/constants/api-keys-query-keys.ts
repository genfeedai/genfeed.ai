/**
 * The organization's API key lists (Settings -> API keys and the Connect
 * Genfeed manual-key step) share this prefix, so a key created or revoked on
 * one surface refreshes the other's cache too.
 */
export function organizationApiKeysQueryKey(organizationId: string) {
  return ['organization-api-keys', organizationId] as const;
}
