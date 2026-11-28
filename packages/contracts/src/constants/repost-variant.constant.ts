/**
 * Bounds of a repost variant: a copy of a Library video that differs enough
 * from the original to post again, yet stays the same video. The API
 * validates against these, the files worker enforces them, and the dialog
 * offers the preset values.
 */
export const REPOST_VARIANT_LIMITS = {
  maxSpeed: 1.5,
  maxTrimStartSeconds: 10,
  maxZoom: 1.3,
  /** Seconds that must remain after cutting the start. */
  minRemainingSeconds: 1,
} as const;

/** What one tap on each checkbox of the Repost variant dialog applies. */
export const REPOST_VARIANT_PRESET = {
  speed: 1.1,
  trimStartSeconds: 2,
  zoom: 1.05,
} as const;
