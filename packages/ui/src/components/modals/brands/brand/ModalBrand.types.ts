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
  const findConnectedCredential = (platform: CredentialPlatform) =>
    brand.credentials?.find(
      (credential) =>
        credential.platform === platform && credential.isConnected === true,
    );

  const youtubeCredential = findConnectedCredential(CredentialPlatform.YOUTUBE);
  if (youtubeCredential && brand.youtubeUrl) {
    connections.push({
      credentialId: youtubeCredential.id,
      handle: brand.youtubeHandle,
      platform: CredentialPlatform.YOUTUBE,
      url: brand.youtubeUrl,
    });
  }

  const tiktokCredential = findConnectedCredential(CredentialPlatform.TIKTOK);
  if (tiktokCredential && brand.tiktokUrl) {
    connections.push({
      credentialId: tiktokCredential.id,
      handle: brand.tiktokHandle,
      platform: CredentialPlatform.TIKTOK,
      url: brand.tiktokUrl,
    });
  }

  const instagramCredential = findConnectedCredential(
    CredentialPlatform.INSTAGRAM,
  );
  if (instagramCredential && brand.instagramUrl) {
    connections.push({
      credentialId: instagramCredential.id,
      handle: brand.instagramHandle,
      platform: CredentialPlatform.INSTAGRAM,
      url: brand.instagramUrl,
    });
  }

  const twitterCredential = findConnectedCredential(CredentialPlatform.TWITTER);
  if (twitterCredential && brand.twitterUrl) {
    connections.push({
      credentialId: twitterCredential.id,
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
