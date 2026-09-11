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
 * A credential stays in this list once it is disconnected (not deleted) —
 * consumers need that row to be able to show "Needs reconnect" instead of the
 * account silently disappearing. `isConnected`, `externalId`, and
 * `accessTokenExpiry` carry through so callers can derive that status; see
 * `getAccountConnectionStatus` in
 * `packages/pages/brands/components/integrations/account-connection-status.util.ts`.
 */
export function buildSocialConnections(
  brand: Pick<BrandOverlayRecord, 'credentials'> | null,
): BrandDetailSocialConnection[] {
  if (!brand) {
    return [];
  }

  return (brand.credentials ?? [])
    .filter((credential) => credential.isDeleted !== true)
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
