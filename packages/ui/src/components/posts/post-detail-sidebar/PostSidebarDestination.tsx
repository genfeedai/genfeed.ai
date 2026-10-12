'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
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
import type { PostSidebarDestinationProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';

const platformIconMap: Partial<Record<CredentialPlatform, IconType>> = {
  [CredentialPlatform.TIKTOK]: TiktokIcon,
  [CredentialPlatform.YOUTUBE]: YoutubeIcon,
  [CredentialPlatform.TWITTER]: XTwitterIcon,
  [CredentialPlatform.INSTAGRAM]: InstagramIcon,
  [CredentialPlatform.FACEBOOK]: FacebookIcon,
  [CredentialPlatform.LINKEDIN]: LinkedinIcon,
  [CredentialPlatform.REDDIT]: RedditIcon,
};

export function getPlatformLabel(
  platform: string | undefined,
  unknownLabel: string,
): string {
  return platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : unknownLabel;
}

interface DestinationFact {
  id: string;
  node: ReactNode;
}

/**
 * Where this post goes: platform, account, status, and the post's own known
 * facts (category, scheduled or published time, SEO score) on one muted line.
 * Not collapsible; it replaces the old platform card and the page fact line.
 */
export default function PostSidebarDestination({
  post,
  credential,
  browserTimezone,
  isPublished,
}: PostSidebarDestinationProps) {
  const translate = useTranslations('ui.postDetailInspector');
  const PlatformIcon = post.platform
    ? platformIconMap[post.platform as CredentialPlatform]
    : undefined;
  const whenValue = isPublished ? post.publicationDate : post.scheduledDate;
  const accountLabel =
    credential?.label && credential.label !== credential.externalHandle
      ? credential.label
      : undefined;

  const facts: DestinationFact[] = [];

  if (post.category) {
    facts.push({
      id: 'category',
      node: <span className="capitalize">{post.category}</span>,
    });
  }

  if (whenValue) {
    facts.push({
      id: 'when',
      node: (
        <ClientDateTime
          value={whenValue}
          prefix={
            isPublished
              ? translate('publishedPrefix')
              : translate('scheduledPrefix')
          }
          format={(date) =>
            date.toLocaleString('en-US', { timeZone: browserTimezone })
          }
        />
      ),
    });
  }

  if (typeof post.seoScore === 'number') {
    facts.push({
      id: 'seo',
      node: translate('seoSummary', { score: Math.round(post.seoScore) }),
    });
  }

  return (
    <div
      className="flex flex-col gap-2 border-b border-border pb-4"
      data-testid="post-destination"
    >
      <div className="flex items-center gap-3">
        {PlatformIcon ? (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <PlatformIcon className="size-5" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {getPlatformLabel(post.platform, translate('unknownPlatform'))}
          </p>
          {credential?.externalHandle || accountLabel ? (
            <p className="truncate text-xs text-muted-foreground">
              {credential?.externalHandle
                ? `@${credential.externalHandle}`
                : null}
              {credential?.externalHandle && accountLabel ? ' · ' : null}
              {accountLabel}
            </p>
          ) : null}
        </div>

        <Badge status={post.status} className="shrink-0 text-xs">
          {post.status}
        </Badge>
      </div>

      {facts.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {facts.map((fact, index) => (
            <Fragment key={fact.id}>
              {index > 0 ? ' · ' : null}
              {fact.node}
            </Fragment>
          ))}
        </p>
      ) : null}

      {post.url ? (
        <Link
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ExternalLink className="size-3" />
          <span>{translate('openOnPlatform')}</span>
        </Link>
      ) : null}
    </div>
  );
}
