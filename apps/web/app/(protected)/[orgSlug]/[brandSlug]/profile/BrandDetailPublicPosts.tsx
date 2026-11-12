import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardVariant,
} from '@genfeedai/contracts';
import { creatorPostPath } from '@genfeedai/contracts/constants';
import {
  getPostMedia,
  postPlatformLabel,
  postTitle,
  toPlainPostText,
} from '@genfeedai/helpers/content/public-post.helper';
import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import type {
  BrandDetailPublicPostsProps,
  PostMetricProps,
  PublicPostCardProps,
} from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

const URL_SCHEME_PATTERN = /^https?:\/\//;

function PostMetric({ icon, label, value }: PostMetricProps) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      <span aria-hidden="true">{formatCompactNumberIntl(value)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function PublicPostCard({ href, post }: PublicPostCardProps) {
  const translate = useTranslations('pages.brandDetailPosts');
  const format = useFormatter();

  const text = toPlainPostText(post.description);
  const title = postTitle(post.label, text);
  const platform =
    postPlatformLabel(post.platform) ?? translate('nativePlatform');
  const publishedAt = post.publishedAt ?? post.createdAt;
  const cover = getPostMedia(post.ingredients).find(
    (item) => item.kind === 'image',
  );

  const card = (
    <Card
      bodyClassName="h-full"
      className="h-full"
      gap={CardGap.MD}
      isInteractive={Boolean(href)}
      variant={CardVariant.BORDERED}
    >
      {cover ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md">
          <Image
            alt=""
            className="object-cover"
            fill
            loading="lazy"
            sizes="(max-width: 640px) 100vw, 420px"
            src={cover.url}
            unoptimized={!canOptimizeImageSource(cover.url)}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
          {title}
        </h3>
        {text && text !== title ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{text}</p>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Badge variant="secondary">{platform}</Badge>
          {publishedAt ? (
            <time dateTime={publishedAt}>
              {format.dateTime(new Date(publishedAt), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
          ) : null}
        </span>
        <span className="flex items-center gap-3">
          <PostMetric
            icon={<Heart className="size-3.5" />}
            label={translate('likes', { count: post.totalLikes ?? 0 })}
            value={post.totalLikes ?? 0}
          />
          <PostMetric
            icon={<MessageCircle className="size-3.5" />}
            label={translate('comments', { count: post.totalComments ?? 0 })}
            value={post.totalComments ?? 0}
          />
          <PostMetric
            icon={<Repeat2 className="size-3.5" />}
            label={translate('reposts', { count: post.totalShares ?? 0 })}
            value={post.totalShares ?? 0}
          />
        </span>
      </div>
    </Card>
  );

  return href ? (
    <Link className="block h-full" href={href}>
      {card}
    </Link>
  ) : (
    card
  );
}

/**
 * The brand's public posts with their performance, newest first: the same
 * posts genfeed.ai serves on the public profile. Replaces the raw assets.
 */
export default function BrandDetailPublicPosts({
  createHref,
  onRetry,
  posts,
  publicHandle,
  status,
}: BrandDetailPublicPostsProps) {
  const translate = useTranslations('pages.brandDetailPosts');
  const websiteUrl = EnvironmentService.apps.website;
  const profileLabel = publicHandle
    ? `${websiteUrl.replace(URL_SCHEME_PATTERN, '')}/@${publicHandle}`
    : undefined;

  return (
    <CollectionSection
      actions={
        publicHandle ? (
          <Button
            asChild
            size={ButtonSize.XS}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link href={`${websiteUrl}/@${publicHandle}`}>
              {translate('publicProfile')}
            </Link>
          </Button>
        ) : undefined
      }
      description={
        profileLabel
          ? translate('description', { profile: profileLabel })
          : undefined
      }
      title={translate('title')}
    >
      {status === 'pending' ? (
        <Card>
          <p
            aria-busy="true"
            className="px-4 py-8 text-center text-sm text-muted-foreground"
            role="status"
          >
            {translate('loading')}
          </p>
        </Card>
      ) : status === 'error' ? (
        <Card>
          <div
            className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center"
            role="alert"
          >
            <p className="text-sm font-medium text-foreground/70">
              {translate('errorTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate('errorHint')}
            </p>
            <Button
              className="mt-2"
              onClick={onRetry}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              {translate('retry')}
            </Button>
          </div>
        </Card>
      ) : posts.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {posts.map((post) => (
            <PublicPostCard
              href={
                publicHandle
                  ? `${websiteUrl}${creatorPostPath(publicHandle, post.id)}`
                  : undefined
              }
              key={post.id}
              post={post}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground/70">
              {translate('emptyTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate('emptyHint')}
            </p>
            {createHref ? (
              <Button
                asChild
                className="mt-2"
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Link href={createHref}>{translate('createPost')}</Link>
              </Button>
            ) : null}
          </div>
        </Card>
      )}
    </CollectionSection>
  );
}
