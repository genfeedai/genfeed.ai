import { CredentialPlatform } from '@genfeedai/enums';
import type { ReactNode } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSnapchat,
  FaStar,
  FaThreads,
  FaTiktok,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';

export interface OAuthConnectPlatform {
  icon: ReactNode;
  label: string;
  platform: CredentialPlatform;
}

/**
 * Ordered list of OAuth-connectable social platforms, shared by the brand social
 * media card (`BrandDetailSocialMediaCard`) and the agent setup panel
 * (`AgentSetupPanel`). Keep additions/removals here so every connect surface
 * stays in sync.
 */
export const OAUTH_CONNECT_PLATFORMS: OAuthConnectPlatform[] = [
  {
    icon: <FaXTwitter className="mr-1.5 size-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    icon: <FaTiktok className="mr-1.5 size-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    icon: <FaYoutube className="mr-1.5 size-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    icon: <FaInstagram className="mr-1.5 size-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    icon: <FaStar className="mr-1.5 size-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    icon: <FaFacebook className="mr-1.5 size-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    icon: <FaLinkedin className="mr-1.5 size-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    icon: <FaPinterest className="mr-1.5 size-3.5" />,
    label: 'Pinterest',
    platform: CredentialPlatform.PINTEREST,
  },
  {
    icon: <FaReddit className="mr-1.5 size-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    icon: <FaThreads className="mr-1.5 size-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    icon: <FaWordpress className="mr-1.5 size-3.5" />,
    label: 'WordPress',
    platform: CredentialPlatform.WORDPRESS,
  },
  {
    icon: <FaSnapchat className="mr-1.5 size-3.5" />,
    label: 'Snapchat',
    platform: CredentialPlatform.SNAPCHAT,
  },
  {
    icon: <FaMastodon className="mr-1.5 size-3.5" />,
    label: 'Mastodon',
    platform: CredentialPlatform.MASTODON,
  },
  {
    icon: <FaShopify className="mr-1.5 size-3.5" />,
    label: 'Shopify',
    platform: CredentialPlatform.SHOPIFY,
  },
];
