/** Operator view: counters and lifetime. The token and url exist only on the mint response. */
export const contentPreviewAttributes = [
  'warmupAccountId',
  'items',
  'expiresAt',
  'revokedAt',
  'claimedAt',
  'firstViewedAt',
  'lastViewedAt',
  'viewCount',
  'ctaClickCount',
  'createdAt',
  'updatedAt',
  'token',
  'url',
];

/**
 * Logged-out visitor view. An explicit allowlist: no timestamps, ids,
 * diagnostics, audit events, credit amounts or operator identity.
 */
export const publicContentPreviewAttributes = ['expiresAt', 'brand', 'items'];
