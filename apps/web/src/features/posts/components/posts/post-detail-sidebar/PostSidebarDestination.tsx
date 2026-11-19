'use client';

import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import AccountIdentity from '@ui/posts/account-identity/AccountIdentity';
import { formatHandle } from '@ui/posts/platform-preview/platform-preview.helpers';
import { getPlatformPreviewIcon } from '@ui/posts/platform-preview/platform-preview-icons';
import { Badge } from '@ui/primitives/badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import { isTikTokInboxDelivered } from '@/features/posts/detail/post-published.helper';
import type { PostSidebarDestinationProps } from '@/props/components/post-detail-sidebar.props';

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
  const platformLabel = getPlatformLabel(
    post.platform,
    translate('unknownPlatform'),
  );
  const accountName =
    credential?.externalName?.trim() ||
    credential?.label?.trim() ||
    credential?.externalHandle?.trim() ||
    platformLabel;
  const accountHandle = formatHandle(credential?.externalHandle ?? undefined);
  const whenValue = isPublished ? post.publicationDate : post.scheduledDate;
  const isTikTokProcessing =
    post.platform === CredentialPlatform.TIKTOK &&
    post.targetExecutionState === TargetExecutionState.PUBLISHING;

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
      <div className="flex items-center justify-between gap-3">
        <AccountIdentity
          avatarAlt={translate('avatarAlt', { name: accountName })}
          avatarUrl={credential?.externalAvatar}
          handle={accountHandle}
          name={accountName}
          PlatformIcon={
            post.platform ? getPlatformPreviewIcon(post.platform) : undefined
          }
          platformLabel={platformLabel}
        />

        {isTikTokInboxDelivered(post) ? (
          <Badge variant="info" className="shrink-0">
            {translate('tiktokInboxDelivered')}
          </Badge>
        ) : isTikTokProcessing ? (
          <Badge variant="info" className="shrink-0">
            {translate('tiktokProcessing')}
          </Badge>
        ) : (
          <Badge status={post.status} className="shrink-0">
            {post.status}
          </Badge>
        )}
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
          <ExternalLink className="size-3.5" />
          <span>{translate('openOnPlatform')}</span>
        </Link>
      ) : null}
    </div>
  );
}
