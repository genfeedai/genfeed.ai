import { CredentialPlatform } from '@genfeedai/enums';
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

  const connections: BrandDetailSocialConnection[] = [];
  const isPlatformConnected = (platform: CredentialPlatform): boolean =>
    !!brand.credentials?.some(
      (credential) =>
        credential.platform === platform && credential.isConnected === true,
    );

  if (isPlatformConnected(CredentialPlatform.YOUTUBE) && brand.youtubeUrl) {
    connections.push({
      handle: brand.youtubeHandle,
      platform: CredentialPlatform.YOUTUBE,
      url: brand.youtubeUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.TIKTOK) && brand.tiktokUrl) {
    connections.push({
      handle: brand.tiktokHandle,
      platform: CredentialPlatform.TIKTOK,
      url: brand.tiktokUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.INSTAGRAM) && brand.instagramUrl) {
    connections.push({
      handle: brand.instagramHandle,
      platform: CredentialPlatform.INSTAGRAM,
      url: brand.instagramUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.TWITTER) && brand.twitterUrl) {
    connections.push({
      handle: brand.twitterHandle,
      platform: CredentialPlatform.TWITTER,
      url: brand.twitterUrl,
    });
  }

  return connections;
}

export type BrandFormValues = {
  backgroundColor: string;
  defaultImageModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  defaultVideoModel: string;
  description: string;
  fontFamily: string;
  slug: string;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  text: string;
};
