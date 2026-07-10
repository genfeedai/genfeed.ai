import { SocialUrlHelper } from '@genfeedai/helpers';
import type { IBrand, ILink } from '@genfeedai/interfaces';
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

export function buildSocialConnections(
  brand: BrandOverlayRecord | null,
): BrandDetailSocialConnection[] {
  if (!brand) {
    return [];
  }

  return (brand.credentials ?? [])
    .filter((credential) => credential.isConnected === true)
    .map((credential) => ({
      accountHealth: credential.accountHealth,
      avatarUrl: credential.externalAvatar,
      credentialId: credential.id,
      handle: credential.externalHandle,
      label: credential.label,
      name: credential.externalName,
      platform: credential.platform,
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
