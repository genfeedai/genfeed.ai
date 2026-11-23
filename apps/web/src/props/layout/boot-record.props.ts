import type { AppRailProps } from '@/props/ui/app-rail.props';

/**
 * What the rail was given the last time the organization was confirmed for the
 * signed-in user, so the next reload can draw the same rail before any request
 * has answered. Plain data only: no keys, no tokens, nothing a request returns
 * beyond which apps the member sees.
 */
export interface BootRailSnapshot
  extends Pick<
    AppRailProps,
    | 'brandAwareSlug'
    | 'brandSlug'
    | 'installedAppIds'
    | 'isAssetGateLocked'
    | 'moduleAccess'
    | 'modulePreferences'
    | 'releaseVisibility'
    | 'showAdmin'
  > {
  /** The platform flags the rail resolved its apps with. */
  flags: Record<string, unknown>;
  hiddenAppIds: string[];
  pinnedAppIds: string[];
  railAppOrder: string[];
}

export interface BootRecord {
  buildId: string;
  /** The organization the server confirmed, by id (the slug can be renamed). */
  organizationId: string;
  organizationSlug: string;
  rail: BootRailSnapshot;
  /** Milliseconds since the epoch, when the server last confirmed this. */
  savedAt: number;
  /**
   * The session this was written under: the fingerprint of the session cookie
   * (see `session-tag.ts`). The record is drawn only while the cookie still
   * carries it.
   */
  sessionTag: string;
  userId: string;
}
