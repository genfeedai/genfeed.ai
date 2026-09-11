import type { IBrand, ILink } from '@genfeedai/contracts/interfaces';
import { SocialUrlHelper } from '@genfeedai/helpers';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';

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
 * A deleted credential is always hidden. Otherwise, a row only earns its
 * place once it has *something* to show: either a captured platform
 * identity (`externalId`) or a live connection. A credential with neither —
 * `isConnected: false` and no `externalId` — is a pending or abandoned OAuth
 * attempt (the picker step never completed, or the user backed out of it)
 * rather than a real account; an orphan-cleanup job reaps these after a TTL,
 * so the UI does not need to surface them as broken in the meantime.
 *
 * Every other combination is a real, visible account — see
 * `getAccountConnectionStatus` in
 * `packages/pages/brands/components/integrations/account-connection-status.util.ts`
 * for how its status (Connected / Needs reconnect / warm-up state) is
 * derived from the same two fields.
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
