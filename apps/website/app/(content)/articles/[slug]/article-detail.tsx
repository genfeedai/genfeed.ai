'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  TwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import type { Article } from '@models/content/article.model';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import ArticleCover from '@website/(content)/articles/article-cover';
import {
  ArrowRight,
  Calendar,
  Clock,
  Share2,
  TriangleAlert,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { resolvePublicArticleAuthor } from './article-author';
import ArticleContent from './article-content';

const articleDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

export function formatArticlePublishedAt(dateString: string): string {
  return articleDateFormatter.format(new Date(dateString));
}

interface SocialLinkItemProps {
  url: string;
  icon: IconType;
  label: string;
}

function SocialLinkItem({
  url,
  icon: Icon,
  label,
}: SocialLinkItemProps): React.ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 py-1 text-xs text-surface transition-colors active:scale-95 hover:text-surface/80 md:text-sm"
    >
      <Icon className="size-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

interface AboutSocialLink {
  icon: IconType;
  label: string;
  url?: string;
}

const GENFEED_DESCRIPTION =
  'The AI Content OS for discovering ideas, creating on-brand content, publishing everywhere, and learning what drives results.';

const GENFEED_SOCIAL_LINKS: readonly AboutSocialLink[] = [
  {
    icon: TwitterIcon,
    label: 'Twitter/X',
    url: EnvironmentService.social.twitter,
  },
  {
    icon: LinkedinIcon,
    label: 'LinkedIn',
    url: EnvironmentService.social.linkedin,
  },
  {
    icon: YoutubeIcon,
    label: 'YouTube',
    url: EnvironmentService.social.youtube,
  },
  {
    icon: InstagramIcon,
    label: 'Instagram',
    url: EnvironmentService.social.instagram,
  },
  {
    icon: TiktokIcon,
    label: 'TikTok',
    url: EnvironmentService.social.tiktok,
  },
] as const;

export function ArticleAbout({
  brand,
}: {
  brand?: Article['brand'];
}): React.ReactElement {
  const label = brand?.label?.trim() || 'Genfeed';
  const description = brand
    ? brand.description?.trim() ||
      `Explore more articles and updates published by ${label}.`
    : GENFEED_DESCRIPTION;
  const logoUrl = brand ? brand.logoUrl : cdnAsset('/assets/branding/logo.jpg');
  const href = brand?.slug ? `/u/${brand.slug}` : '/about';
  const linkLabel = brand?.slug ? `More from ${label}` : 'About Genfeed';
  const socialLinks: readonly AboutSocialLink[] = brand
    ? [
        { icon: TwitterIcon, label: 'Twitter/X', url: brand.twitterUrl },
        { icon: LinkedinIcon, label: 'LinkedIn', url: brand.linkedinUrl },
        { icon: YoutubeIcon, label: 'YouTube', url: brand.youtubeUrl },
        { icon: InstagramIcon, label: 'Instagram', url: brand.instagramUrl },
        { icon: TiktokIcon, label: 'TikTok', url: brand.tiktokUrl },
      ]
    : GENFEED_SOCIAL_LINKS;
  const visibleSocialLinks = socialLinks.filter(
    (socialLink): socialLink is AboutSocialLink & { url: string } =>
      Boolean(socialLink.url),
  );

  return (
    <div className="border border-edge/[0.08] bg-fill/10 p-4 backdrop-blur-sm md:p-6">
      <h2 className="mb-4 text-base font-semibold text-surface md:text-lg">
        About {label}
      </h2>

      <div className="space-y-4">
        {logoUrl && (
          <div className="flex justify-center lg:justify-start">
            <Image
              alt={`${label} logo`}
              className="size-20 rounded-full object-cover ring-4 ring-edge/20 md:size-24"
              height={96}
              priority
              src={logoUrl}
              width={96}
            />
          </div>
        )}

        <p className="text-center text-xs leading-5 text-surface/70 lg:text-left md:text-sm">
          {description}
        </p>

        <Link
          className="flex items-center justify-center gap-2 border border-edge/[0.08] bg-fill/10 px-3 py-2 text-xs text-surface transition-colors hover:border-edge/20 hover:bg-fill/20 hover:text-surface/80 lg:justify-start md:text-sm"
          href={href}
        >
          <span>{linkLabel}</span>
          <ArrowRight className="size-4 flex-shrink-0" aria-hidden="true" />
        </Link>

        {visibleSocialLinks.length > 0 && (
          <div className="space-y-2 border-t border-edge/20 pt-3 md:space-y-2.5">
            {visibleSocialLinks.map((socialLink) => (
              <SocialLinkItem
                icon={socialLink.icon}
                key={socialLink.label}
                label={socialLink.label}
                url={socialLink.url}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArticleDetail({
  article,
  isPreview,
}: {
  article: Article | null;
  isPreview: boolean;
}) {
  const { push } = useRouter();

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      await clipboardService.copyToClipboard(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy to clipboard:', error);
    }
  };

  if (!article || article?.id === 'undefined') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <CardEmpty
          label="Article not found"
          description="The article you are looking for does not exist."
          action={{
            label: 'Read articles',
            onClick: () => push('/articles'),
          }}
        />
      </div>
    );
  }

  const brand = article.brand;
  const authorLabel = resolvePublicArticleAuthor(article);

  return (
    <div
      className="flex min-h-screen flex-col px-4 pb-8 pt-32"
      style={{ backgroundColor: brand?.backgroundColor || '#000' }}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex items-center justify-between md:mb-8">
          <div>
            <h1 className="mb-2 text-3xl font-semibold text-surface md:text-4xl">
              {article.label}
            </h1>

            {article.summary && (
              <p className="text-base text-surface/70 md:text-lg">
                {article.summary}
              </p>
            )}
          </div>

          <Button
            variant={ButtonVariant.SECONDARY}
            className="border border-edge/[0.08] bg-fill/10 text-surface backdrop-blur-sm transition-all hover:border-edge/20 hover:bg-fill/20"
            onClick={handleShare}
          >
            <Share2 className="size-4" />
            {copied ? 'Copied!' : 'Share'}
          </Button>
        </div>

        <ArticleCover
          category={article.category}
          coverImageUrl={article.coverImageUrl}
          label={article.label}
          seed={article.slug || article.id}
        />

        {isPreview && (
          <div className="mb-6 flex items-start gap-3 border border-yellow-500/30 bg-yellow-500/20 p-4 backdrop-blur-sm md:mb-8">
            <TriangleAlert className="size-4 flex-shrink-0 text-yellow-300" />
            <span className="text-sm text-surface md:text-base">
              You are viewing a preview of this article. This article may not be
              published or publicly visible yet.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <header className="mb-6 md:mb-8">
              {article.category && (
                <Badge
                  variant="primary"
                  className="mb-3 bg-fill/20 text-xs text-surface border-edge/30 md:mb-4 md:text-sm"
                >
                  {article.category}
                </Badge>
              )}

              <div className="flex flex-wrap items-center gap-3 border-b border-edge/20 pb-4 text-xs text-surface/60 md:gap-4 md:pb-6 md:text-sm">
                {authorLabel && (
                  <div className="flex items-center gap-2.5">
                    <User className="size-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="truncate">{authorLabel}</span>
                  </div>
                )}

                {article.publishedAt && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="size-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="whitespace-nowrap">
                      {formatArticlePublishedAt(article.publishedAt)}
                    </span>
                  </div>
                )}

                {article.readingTime && (
                  <div className="flex items-center gap-2.5">
                    <Clock className="size-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="whitespace-nowrap">
                      {article.readingTime} min read
                    </span>
                  </div>
                )}
              </div>
            </header>

            <ArticleContent
              articleLabel={article.label}
              html={article.content || ''}
              slug={article.slug}
            />
          </div>

          <aside className="order-first lg:order-last lg:col-span-1">
            <div className="lg:sticky lg:top-4 lg:self-start">
              <ArticleAbout brand={brand} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
