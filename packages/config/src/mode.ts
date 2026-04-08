/**
 * Genfeed deployment mode detection.
 *
 * Three modes:
 * - CLOUD:  Full SaaS (Clerk required, S3, billing)
 * - HYBRID: Local app with optional Clerk cloud connection
 * - LOCAL:  Fully offline (no Clerk, BYOK only, local filesystem)
 *
 * Detection logic:
 * - GENFEED_CLOUD set        → CLOUD
 * - CLERK_SECRET_KEY set      → HYBRID (Clerk available but optional)
 * - Neither                   → LOCAL
 */

export enum GenfeedMode {
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
  LOCAL = 'local',
}

export const GENFEED_MODE: GenfeedMode = process.env.GENFEED_CLOUD
  ? GenfeedMode.CLOUD
  : process.env.CLERK_SECRET_KEY
    ? GenfeedMode.HYBRID
    : GenfeedMode.LOCAL;

/** True when fully offline — no Clerk, no cloud */
export const IS_LOCAL_MODE: boolean = GENFEED_MODE === GenfeedMode.LOCAL;

/** True when local app with optional Clerk cloud connection */
export const IS_HYBRID_MODE: boolean = GENFEED_MODE === GenfeedMode.HYBRID;

/** True when running as Genfeed Cloud SaaS */
export const IS_CLOUD_MODE: boolean = GENFEED_MODE === GenfeedMode.CLOUD;
