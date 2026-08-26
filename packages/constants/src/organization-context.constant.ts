/**
 * Carries the organization identity confirmed by the routed application shell.
 * The API compares it with the authenticated identity and fails closed on drift.
 */
export const ORGANIZATION_CONTEXT_HEADER = 'x-genfeed-organization-id';

/** Cross-tab signal only; the payload deliberately contains no tenant identity. */
export const ROUTED_ORGANIZATION_STORAGE_KEY =
  'genfeed:routed-organization-context:v1';
