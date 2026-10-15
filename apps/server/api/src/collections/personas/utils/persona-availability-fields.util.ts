const AVAILABILITY_FIELDS = [
  'availabilityMode',
  'availableBrandIds',
  'availabilityAudits',
  'isShared',
  'availableBrandCount',
  'owningBrandId',
  'owningBrandName',
] as const;

/**
 * Availability is changed only through `PATCH /personas/:id/availability`
 * (admin-gated and audited), never through the generic create/update routes.
 */
export function stripAvailabilityFields<T extends object>(dto: T): T {
  const copy = { ...dto } as Record<string, unknown>;
  for (const field of AVAILABILITY_FIELDS) {
    delete copy[field];
  }
  return copy as T;
}
