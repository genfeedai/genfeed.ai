'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import type { ICredential, IPost } from '@genfeedai/contracts/interfaces';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  RedditIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

const platformIconMap: Partial<Record<CredentialPlatform, IconType>> = {
  [CredentialPlatform.TIKTOK]: TiktokIcon,
  [CredentialPlatform.YOUTUBE]: YoutubeIcon,
  [CredentialPlatform.TWITTER]: XTwitterIcon,
  [CredentialPlatform.INSTAGRAM]: InstagramIcon,
  [CredentialPlatform.FACEBOOK]: FacebookIcon,
  [CredentialPlatform.LINKEDIN]: LinkedinIcon,
  [CredentialPlatform.REDDIT]: RedditIcon,
};

const getPlatformLabel = (platform?: string) =>
  platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Unknown';

type PostSidebarPlatformCardProps = {
  post: IPost;
  credential: ICredential | undefined;
};

export default function PostSidebarPlatformCard({
  post,
  credential,
}: PostSidebarPlatformCardProps) {
  const PlatformIcon = post.platform
    ? platformIconMap[post.platform as CredentialPlatform]
    : undefined;

  return (
    <Card>
      <div className="flex items-center gap-3 w-full">
        {PlatformIcon && (
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-background">
            <PlatformIcon className="size-6" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {getPlatformLabel(post.platform)}
          </p>

          {credential?.externalHandle && (
            <p className="text-lg text-foreground/60 truncate">
              @{credential.externalHandle}
            </p>
          )}
        </div>

        <div className="flex items-center ml-auto">
          <Badge status={post.status} className="text-xs">
            {post.status}
          </Badge>
        </div>
      </div>

      {post.url && (
        <Link
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 border border-input bg-secondary/50 px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full"
        >
          <ExternalLink className="size-4" />
          <span>Open on platform</span>
        </Link>
      )}
    </Card>
  );
}
