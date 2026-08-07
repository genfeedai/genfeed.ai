/**
 * Public model catalog attributes (#2422).
 *
 * Deliberately NOT built from `modelAttributes` / `createEntityAttributes`:
 * the registry row carries operator-internal and commercially sensitive fields
 * (`providerConfig`, `providerCostUsd`, `margin`, `reviewedBy`,
 * `rejectionReason`, `organizationId`, review/discovery timestamps) that must
 * never reach an unauthenticated caller. This list is an explicit allowlist —
 * a new registry column stays invisible to the public catalog until it is
 * added here on purpose.
 *
 * `cost` is the customer-facing credit price, not a provider cost.
 */
export const modelCatalogAttributes = [
  'key',
  'label',
  'description',
  'category',
  'provider',
  'cost',
  'costTier',
  'qualityTier',
  'speedTier',
  'capabilities',
  'recommendedFor',
  'supportsFeatures',
  'isDefault',
  'isHighlighted',
  'aspectRatios',
  'defaultAspectRatio',
  'durations',
  'defaultDuration',
  'maxOutputs',
];
