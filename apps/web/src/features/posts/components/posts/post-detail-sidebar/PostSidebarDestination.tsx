'use client';

import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import { isTikTokInboxDelivered } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import { Badge } from '@ui/primitives/badge';
import DateText from '@ui/time/DateText';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
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
  isPublished,
}: PostSidebarDestinationProps) {
  const translate = useTranslations('ui.postDetailInspector');
  const platformLabel = getPlatformLabel(
    post.platform,
    translate('unknownPlatform'),
  );
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
        <>
          {isPublished
            ? translate('publishedPrefix')
            : translate('scheduledPrefix')}
          <DateText value={whenValue} />
        </>
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
        <ConnectedAccount
          account={
            credential
              ? {
                  ...toConnectedAccount(credential),
                  platform: post.platform ?? credential.platform,
                }
              : { name: platformLabel, platform: post.platform ?? '' }
          }
          layout="stacked"
          size="lg"
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
    </div>
  );
}
