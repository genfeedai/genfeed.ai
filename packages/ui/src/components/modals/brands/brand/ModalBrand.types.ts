import type { IBrand, ILink } from '@genfeedai/contracts/interfaces';
import { SocialUrlHelper } from '@genfeedai/helpers';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountConnectionStatus } from '@genfeedai/props/pages/brand-integrations.props';

export type BrandOverlayView = 'edit' | 'overview';
export type BrandEditorTab = 'branding' | 'info' | 'models';

export type BrandOverlayRecord = Brand &
  IBrand & {
    defaultImageModel?: string | null;
    defaultImageToVideoModel?: string | null;
    defaultMusicModel?: string | null;
    defaultVideoModel?: string | null;
    links?: ILink[];
  };

/**
 * Whether a credential should render as an account row at all.
 *
 * The `isDeleted` guard is defensive rather than the real filter: the
 * credential serializer does not expose `isDeleted` in its public fields,
 * so an API payload never actually carries a soft-deleted row for this
 * branch to catch — the server's own tenant-scoped query (`isDeleted:
 * false`) already excludes it before it reaches this function. Keeping the
 * check here costs nothing and protects any caller that builds a
 * credential object outside that path (e.g. a test fixture).
 *
 * The branch that does real work in production is the second one: a row
 * only earns its place once it has *something* to show — either a
 * captured platform identity (`externalId`) or a live connection. A
 * credential with neither — `isConnected: false` and no `externalId` — is
 * a pending or abandoned OAuth attempt (the picker step never completed,
 * or the user backed out of it) rather than a real account; an
 * orphan-cleanup job reaps these after a TTL, so the UI does not need to
 * surface them as broken in the meantime.
 *
 * Every other combination is a real, visible account — see
 * `getAccountConnectionStatus` below for how its status (Connected / Needs
 * reconnect / warm-up state) is derived from the same two fields.
 */
export function isVisibleCredentialRow(credential: {
  externalId?: string | null;
  isConnected: boolean;
  isDeleted?: boolean;
}): boolean {
  if (credential.isDeleted === true) {
    return false;
  }

  if (credential.isConnected === false && !credential.externalId) {
    return false;
  }

  return true;
}

/**
 * `accessTokenExpiry` is unset for platforms that never rotate a token.
 * An unparseable value (`NaN` from `Date`) is treated as expired rather
 * than valid — a malformed timestamp is not proof of a good token.
 */
export function isAccessTokenExpired(
  accessTokenExpiry?: string | null,
): boolean {
  if (!accessTokenExpiry) {
    return false;
  }

  const expiry = new Date(accessTokenExpiry).getTime();
  if (!Number.isFinite(expiry)) {
    return true;
  }

  return expiry <= Date.now();
}

/**
 * The subset of a connection `getAccountConnectionStatus` actually reads.
 * Keeping this narrow (rather than the full `BrandDetailSocialConnection`)
 * lets callers that only have a partial record — e.g. the platform-home
 * page's own connection shape, or `use-brand-detail.ts` before it has
 * built a full connection — call it without first assembling one.
 */
export type AccountConnectionStatusInput = Pick<
  BrandDetailSocialConnection,
  'accessTokenExpiry' | 'externalId' | 'isConnected'
>;

/**
 * A row needs reconnecting when it never captured a platform identity
 * (`externalId`) — including a still-`isConnected` row whose OAuth flow
 * finished without one, e.g. a legacy broken connection — when it has an
 * identity but is no longer connected (a lapsed connection), or when its
 * access token has expired. `isConnected` defaults to connected when
 * omitted so legacy callers that only ever built connected rows keep
 * behaving the same way.
 *
 * A row with neither an identity nor a connection (pending or abandoned
 * OAuth — the credential exists only because the flow never finished) does
 * not reach this function at all: `buildSocialConnections` hides it before
 * status is ever derived. See `isVisibleCredentialRow` above.
 *
 * Lives alongside `isVisibleCredentialRow` (rather than in the
 * pages-layer `account-connection-status.util.ts` that re-exports it) so
 * `packages/hooks` can derive status via the same `packages/hooks` ->
 * `packages/ui` alias it already uses for `buildSocialConnections` —
 * that edge predates this change, rather than routing it through
 * `packages/pages`, which `packages/hooks` doesn't otherwise reach into.
 */
export function getAccountConnectionStatus(
  connection: AccountConnectionStatusInput,
): AccountConnectionStatus {
  if (!connection.externalId) {
    return 'needsReconnect';
  }

  if (connection.isConnected === false) {
    return 'needsReconnect';
  }

  if (isAccessTokenExpired(connection.accessTokenExpiry)) {
    return 'needsReconnect';
  }

  return 'connected';
}

export function buildSocialConnections(
  brand: Pick<BrandOverlayRecord, 'credentials'> | null,
): BrandDetailSocialConnection[] {
  if (!brand) {
    return [];
  }

  return (brand.credentials ?? [])
    .filter((credential) => isVisibleCredentialRow(credential))
    .map((credential) => ({
      accessTokenExpiry: credential.accessTokenExpiry,
      accountHealth: credential.accountHealth,
      avatarUrl: credential.externalAvatar,
      credentialId: credential.id,
      externalId: credential.externalId,
      handle: credential.externalHandle,
      isConnected: credential.isConnected,
      label: credential.label,
      name: credential.externalName,
      platform: credential.platform,
      postingTimes: credential.postingTimes,
      url: SocialUrlHelper.buildProfileUrl(
        credential.platform,
        credential.externalHandle,
        credential.externalId,
      ),
    }));
}

export type BrandFormValues = {
  backgroundColor: string;
  defaultImageModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  defaultVideoModel: string;
  description: string;
  fontFamily: string;
  organizationId: string;
  slug: string;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  text: string;
  websiteUrl: string;
};
