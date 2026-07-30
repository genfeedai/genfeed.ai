import { CredentialPlatform } from '@genfeedai/enums';
import {
  FacebookIcon,
  GoogleIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  PinterestIcon,
  RedditIcon,
  ShopifyIcon,
  SnapchatIcon,
  ThreadsIcon,
  TiktokIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';

export interface OAuthConnectPlatform {
  icon: ReactNode;
  label: string;
  platform: CredentialPlatform;
  servicePath?: string;
}

/**
 * Ordered list of OAuth-connectable social platforms, shared by the brand social
 * media card (`BrandDetailSocialMediaCard`) and the agent setup panel
 * (`AgentSetupPanel`). Keep additions/removals here so every connect surface
 * stays in sync.
 */
export const OAUTH_CONNECT_PLATFORMS: OAuthConnectPlatform[] = [
  {
    icon: <XTwitterIcon className="mr-1.5 size-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    icon: <TiktokIcon className="mr-1.5 size-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    icon: <YoutubeIcon className="mr-1.5 size-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    icon: <InstagramIcon className="mr-1.5 size-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    icon: <Star className="mr-1.5 size-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    icon: <FacebookIcon className="mr-1.5 size-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    icon: <GoogleIcon className="mr-1.5 size-3.5" />,
    label: 'Google Ads',
    platform: CredentialPlatform.GOOGLE_ADS,
    servicePath: 'google-ads',
  },
  {
    icon: <LinkedinIcon className="mr-1.5 size-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    icon: <PinterestIcon className="mr-1.5 size-3.5" />,
    label: 'Pinterest',
    platform: CredentialPlatform.PINTEREST,
  },
  {
    icon: <RedditIcon className="mr-1.5 size-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    icon: <ThreadsIcon className="mr-1.5 size-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    icon: <WordpressIcon className="mr-1.5 size-3.5" />,
    label: 'WordPress',
    platform: CredentialPlatform.WORDPRESS,
  },
  {
    icon: <SnapchatIcon className="mr-1.5 size-3.5" />,
    label: 'Snapchat',
    platform: CredentialPlatform.SNAPCHAT,
  },
  {
    icon: <MastodonIcon className="mr-1.5 size-3.5" />,
    label: 'Mastodon',
    platform: CredentialPlatform.MASTODON,
  },
  {
    icon: <ShopifyIcon className="mr-1.5 size-3.5" />,
    label: 'Shopify',
    platform: CredentialPlatform.SHOPIFY,
  },
];
