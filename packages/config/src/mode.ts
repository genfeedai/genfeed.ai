/**
 * Genfeed deployment mode detection.
 *
 * Three modes:
 * - CLOUD:  Full SaaS (Better Auth, S3, billing)
 * - HYBRID: Local app with Better Auth cloud connection
 * - LOCAL:  Fully offline (BYOK only, local filesystem)
 *
 * Detection logic:
 * - GENFEED_CLOUD set             → CLOUD
 * - BETTER_AUTH_ENABLED not false → HYBRID
 * - BETTER_AUTH_ENABLED=false     → LOCAL
 */

export enum GenfeedMode {
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
  LOCAL = 'local',
}

export const GENFEED_MODE: GenfeedMode = process.env.GENFEED_CLOUD
  ? GenfeedMode.CLOUD
  : process.env.BETTER_AUTH_ENABLED !== 'false'
    ? GenfeedMode.HYBRID
    : GenfeedMode.LOCAL;

/** True when fully offline — no Better Auth, no cloud */
export const IS_LOCAL_MODE: boolean = GENFEED_MODE === GenfeedMode.LOCAL;

/** True when local app with Better Auth cloud connection */
export const IS_HYBRID_MODE: boolean = GENFEED_MODE === GenfeedMode.HYBRID;

/** True when running as Genfeed Cloud SaaS */
export const IS_CLOUD_MODE: boolean = GENFEED_MODE === GenfeedMode.CLOUD;
