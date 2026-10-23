import { CredentialPlatform } from '@genfeedai/contracts';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  MediumIcon,
  PinterestIcon,
  RedditIcon,
  ThreadsIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { PlatformPreviewIcon } from '@genfeedai/props/components/platform-preview.props';
import { resolvePreviewPlatform } from '@ui/posts/platform-preview/PlatformPreview.data';
import { Globe } from 'lucide-react';
export const PLATFORM_PREVIEW_ICONS: Partial<
  Record<CredentialPlatform, PlatformPreviewIcon>
> = {
  [CredentialPlatform.FACEBOOK]: FacebookIcon,
  [CredentialPlatform.INSTAGRAM]: InstagramIcon,
  [CredentialPlatform.LINKEDIN]: LinkedinIcon,
  [CredentialPlatform.MEDIUM]: MediumIcon,
  [CredentialPlatform.PINTEREST]: PinterestIcon,
  [CredentialPlatform.REDDIT]: RedditIcon,
  [CredentialPlatform.THREADS]: ThreadsIcon,
  [CredentialPlatform.TIKTOK]: TiktokIcon,
  [CredentialPlatform.TWITTER]: XTwitterIcon,
  [CredentialPlatform.YOUTUBE]: YoutubeIcon,
};

export const GENERIC_PLATFORM_PREVIEW_ICON: PlatformPreviewIcon = Globe;

export function getPlatformPreviewIcon(
  platform: CredentialPlatform | string,
): PlatformPreviewIcon {
  const resolvedPlatform = resolvePreviewPlatform(platform);

  return resolvedPlatform
    ? (PLATFORM_PREVIEW_ICONS[resolvedPlatform] ??
        GENERIC_PLATFORM_PREVIEW_ICON)
    : GENERIC_PLATFORM_PREVIEW_ICON;
}
