import { getArticleResource } from '@data/article-resources.data';
import {
  creatorArticlePath,
  creatorProfilePath,
  creatorTabPath,
  GENFEED_BRAND_HANDLE,
} from '@genfeedai/contracts/constants';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { createMarkup } from '@genfeedai/helpers';
import {
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  TwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { Article } from '@models/content/article.model';
import type { Brand } from '@models/organization/brand.model';
import type { ArticleSection } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import CopyLinkButton from '@web-components/creator/CopyLinkButton';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import ArticleCover from '@website/(content)/articles/article-cover';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { resolvePublicArticleAuthor } from './article-author';
import ArticleContent from './article-content';
import ArticleResource from './article-resource';
import { buildArticleSections } from './article-sections';

/**
 * The "apply this guide" agent link. Built here so the app's route table stays
 * on the server instead of shipping with the article's client island.
 */
export function buildArticleApplyHref(articleLabel: string): string {
  const prompt = `Help me apply the guide "${articleLabel}" to my brand. Ask for any context you need, then turn the article into a concrete content plan and create the first asset.`;
  return `${EnvironmentService.apps.app}${buildAgentPromptHref(prompt)}`;
}

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
      className="flex items-center gap-2 py-1 text-xs text-foreground transition-colors active:scale-95 hover:text-foreground/80 md:text-sm"
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
  handle = GENFEED_BRAND_HANDLE,
}: {
  brand?: Brand | null;
  handle?: string;
}): React.ReactElement {
  const isGenfeed = !brand || handle === GENFEED_BRAND_HANDLE;
  const label = brand?.label?.trim() || 'Genfeed';
  const description =
    brand?.description?.trim() ||
    (isGenfeed
      ? metadata.description
      : `Explore more articles and updates published by ${label}.`);
  const logoUrl =
    brand?.logoUrl ||
    (isGenfeed ? cdnAsset('/assets/branding/logo.jpg') : undefined);
  const socialLinks: readonly AboutSocialLink[] = isGenfeed
    ? GENFEED_SOCIAL_LINKS
    : [
        { icon: TwitterIcon, label: 'Twitter/X', url: brand?.twitterUrl },
        { icon: LinkedinIcon, label: 'LinkedIn', url: brand?.linkedinUrl },
        { icon: YoutubeIcon, label: 'YouTube', url: brand?.youtubeUrl },
        { icon: InstagramIcon, label: 'Instagram', url: brand?.instagramUrl },
        { icon: TiktokIcon, label: 'TikTok', url: brand?.tiktokUrl },
      ];
  const visibleSocialLinks = socialLinks.filter(
    (socialLink): socialLink is AboutSocialLink & { url: string } =>
      Boolean(socialLink.url),
  );

  return (
    <div className="border border-foreground/10 bg-foreground/5 p-4 backdrop-blur-sm md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <BrandAvatar
          alt={`${label} logo`}
          name={label}
          size="2xl"
          src={logoUrl}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-base font-semibold text-foreground md:text-lg">
            About {label}
          </h2>
          <p className="text-sm leading-6 text-foreground/70">{description}</p>
          <Link
            className="inline-flex items-center gap-2 text-sm text-foreground hover:text-foreground/80"
            href={creatorProfilePath(handle)}
          >
            <span>More from {label}</span>
            <ArrowRight className="size-4 flex-shrink-0" aria-hidden="true" />
          </Link>
          {visibleSocialLinks.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-foreground/10 pt-3">
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
    </div>
  );
}

function ArticleOutline({
  sections,
}: {
  sections: ArticleSection[];
}): React.ReactElement | null {
  if (sections.length === 0) {
    return null;
  }

  return (
    <nav aria-label="On this page" className="space-y-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/50">
        On this page
      </p>
      <ol className="space-y-2 border-l border-foreground/10">
        {sections.map((section) => (
          <li
            className={section.level === 3 ? 'pl-6' : 'pl-3'}
            key={section.id}
          >
            <a
              className="block text-foreground/60 hover:text-foreground"
              href={`#${section.id}`}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The article page: who wrote it and how to share it up top, then a centred
 * reading column with the outline parked beside it on wide screens.
 */
export default function ArticleDetail({
  article,
  brand = null,
  handle = GENFEED_BRAND_HANDLE,
  isPreview,
}: {
  article: Article;
  brand?: Brand | null;
  handle?: string;
  isPreview: boolean;
}) {
  // The free skills belong to Genfeed's own guides, never to a customer's
  // article that happens to share a slug.
  const resource =
    !isPreview && handle === GENFEED_BRAND_HANDLE
      ? getArticleResource(article.slug)
      : null;
  const authorLabel = resolvePublicArticleAuthor(article);
  const brandLabel = brand?.label?.trim() || 'Genfeed';
  const articleUrl = `${EnvironmentService.apps.website}${creatorArticlePath(handle, article.slug || article.id)}`;
  // Sanitized here, on the server: the sanitizer never ships to readers, and
  // the client island only receives markup that already went through it.
  const { html, sections } = buildArticleSections(
    createMarkup(article.content || '').__html,
  );

  return (
    <div className="flex min-h-screen flex-col px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex min-w-0 items-center gap-1.5 text-sm text-foreground/60"
        >
          <Link
            className="shrink-0 hover:text-foreground"
            href={creatorProfilePath(handle)}
          >
            @{handle}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            className="shrink-0 hover:text-foreground"
            href={creatorTabPath(handle, 'articles')}
          >
            articles
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="truncate text-foreground/80">
            {article.label}
          </span>
        </nav>

        <header className="mx-auto mb-8 max-w-3xl">
          {article.category && (
            <Badge className="mb-4" size="lg" variant="secondary">
              {article.category}
            </Badge>
          )}
          <h1 className="mb-4 text-3xl font-semibold text-foreground md:text-5xl md:leading-tight">
            {article.label}
          </h1>
          {article.summary && (
            <p className="mb-6 text-base text-foreground/70 md:text-lg">
              {article.summary}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-foreground/10 py-4">
            <Link
              className="flex min-w-0 items-center gap-3"
              href={creatorProfilePath(handle)}
            >
              <BrandAvatar
                alt={`${brandLabel} logo`}
                name={brandLabel}
                size="md"
                src={
                  brand?.logoUrl ||
                  (handle === GENFEED_BRAND_HANDLE
                    ? cdnAsset('/assets/branding/logo.jpg')
                    : undefined)
                }
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {authorLabel ? `${authorLabel} · ${brandLabel}` : brandLabel}
                </span>
                <span className="block text-xs text-foreground/60">
                  @{handle}
                  {article.publishedAt ? (
                    <>
                      {' · '}
                      <time dateTime={article.publishedAt}>
                        {formatArticlePublishedAt(article.publishedAt)}
                      </time>
                    </>
                  ) : null}
                  {article.readingTime
                    ? ` · ${article.readingTime} min read`
                    : null}
                </span>
              </span>
            </Link>
            <CopyLinkButton url={articleUrl} />
          </div>
        </header>

        <div className="mx-auto max-w-4xl">
          <ArticleCover
            category={article.category}
            coverImageUrl={article.coverImageUrl}
            label={article.label}
            seed={article.slug || article.id}
          />
        </div>

        {isPreview && (
          <Alert className="mx-auto mb-8 max-w-3xl" variant="warning">
            You are viewing a preview of this article. This article may not be
            published or publicly visible yet.
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="mx-auto w-full max-w-3xl min-w-0 space-y-12">
            <div>
              <ArticleContent
                applyHref={buildArticleApplyHref(article.label)}
                sanitizedHtml={html}
                sections={sections}
                slug={article.slug}
                resource={resource}
              />
              {resource ? (
                <ArticleResource
                  key={article.slug}
                  slug={article.slug}
                  resource={resource}
                />
              ) : null}
            </div>

            <footer className="space-y-6">
              {brand ? <ProfileSubscribe brandId={brand.id} /> : null}
              <ArticleAbout brand={brand} handle={handle} />
            </footer>
          </div>

          <aside className="hidden lg:block">
            {/* Public topbar is h-20; top-24 keeps a 1rem gap, matching heading scroll-mt-24. */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <ArticleOutline sections={sections} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
