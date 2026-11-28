import { stringifyJsonLd } from '@data/json-ld';
import { postMediaRenditionPath } from '@data/post-media-rendition';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  creatorPostPath,
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import {
  getPostMedia,
  postPlatformLabel,
  postTitle,
  toPlainPostText,
} from '@genfeedai/helpers/content/public-post.helper';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { Post } from '@models/content/post.model';
import type { CreatorPostRouteProps } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import CopyLinkButton from '@web-components/creator/CopyLinkButton';
import CreatorPostMedia from '@web-components/creator/CreatorPostMedia';
import CreatorPostMetrics from '@web-components/creator/CreatorPostMetrics';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCreatorPost } from './post-loader';
import RelatedPosts from './related-posts';

export const revalidate = 300;
export const dynamicParams = true;

/** Renders on first request, then caches (see the profile page). */
export function generateStaticParams(): { handle: string; id: string }[] {
  return [];
}

const signUpUrl = new URL('/sign-up', EnvironmentService.apps.app).toString();

/** Where else the post went out: its own network link, then its cross-posts. */
function listNetworkLinks(post: Post): { label: string; url: string }[] {
  const links = [
    { platform: post.platform, url: post.postUrl },
    ...(post.crossPosts ?? []),
  ];
  const seen = new Set<string>();
  return links.flatMap(({ platform, url }) => {
    const label = postPlatformLabel(platform);
    if (!label || !url || seen.has(label)) {
      return [];
    }
    seen.add(label);
    return [{ label, url }];
  });
}

const postDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

export async function generateMetadata({
  params,
}: CreatorPostRouteProps): Promise<Metadata> {
  const { handle, id } = await params;
  const result = await getCreatorPost(handle, id);

  if (!result) {
    return {
      robots: { follow: false, index: false },
      title: `Post not found | ${metadata.name}`,
    };
  }

  const text = toPlainPostText(result.post.description);
  const title = postTitle(result.post.label, text);
  const description = text.slice(0, 200) || title;
  const url = `${EnvironmentService.apps.website}${creatorPostPath(result.handle, result.post.id)}`;
  const firstImage = getPostMedia(result.post.ingredients).find(
    (item) => item.kind === 'image',
  );
  const image =
    firstImage?.url || result.brand.bannerUrl || metadata.cards.default;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      images: [{ alt: title, url: image }],
      siteName: metadata.name,
      title,
      type: 'article',
      url,
    },
    title: `${title} | @${result.handle}`,
    twitter: {
      card: 'summary_large_image',
      description,
      images: [image],
      title,
    },
  };
}

export default async function CreatorPostPage({
  params,
}: CreatorPostRouteProps) {
  const { handle: requestedHandle, id } = await params;
  const result = await getCreatorPost(requestedHandle, id);

  if (!result) {
    notFound();
  }

  const { brand, handle, post } = result;
  const text = toPlainPostText(post.description);
  const title = postTitle(post.label, text);
  const media = getPostMedia(post.ingredients);
  const images = media.filter((item) => item.kind === 'image');
  const networkLinks = listNetworkLinks(post);
  const publishedAt = post.publishedAt ?? post.createdAt;
  const url = `${EnvironmentService.apps.website}${creatorPostPath(handle, post.id)}`;
  const name = brand.label?.trim() || `@${handle}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    author: {
      '@type': 'Organization',
      name,
      url: `${EnvironmentService.apps.website}${creatorProfilePath(handle)}`,
    },
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    headline: title,
    ...(text ? { articleBody: text } : {}),
    ...(images.length > 0
      ? {
          image: images.map((item) => ({
            '@type': 'ImageObject',
            caption: title,
            contentUrl: `${EnvironmentService.apps.website}${postMediaRenditionPath(handle, post.id, item.id, 1280)}`,
            ...(item.width ? { width: item.width } : {}),
            ...(item.height ? { height: item.height } : {}),
          })),
        }
      : {}),
    ...(networkLinks.length > 0
      ? { sameAs: networkLinks.map((link) => link.url) }
      : {}),
    url,
  };

  return (
    <>
      <article className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <script type="application/ld+json">{stringifyJsonLd(jsonLd)}</script>
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center gap-1.5 text-sm text-foreground/60"
        >
          <Link
            className="hover:text-foreground"
            href={creatorProfilePath(handle)}
          >
            @{handle}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            className="hover:text-foreground"
            href={creatorTabPath(handle, 'posts')}
          >
            posts
          </Link>
        </nav>

        <Link
          className="mb-6 flex items-center gap-3"
          href={creatorProfilePath(handle)}
        >
          <BrandAvatar
            alt={`${name} logo`}
            name={name}
            size="md"
            src={brand.logoUrl}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            <span className="block text-xs text-foreground/60">
              @{handle}
              {publishedAt ? (
                <>
                  {' · '}
                  <time dateTime={publishedAt}>
                    {postDateFormatter.format(new Date(publishedAt))}
                  </time>
                </>
              ) : null}
            </span>
          </span>
        </Link>

        <h1 className="mb-4 text-2xl font-semibold text-foreground">{title}</h1>
        {text && text !== title ? (
          <p className="whitespace-pre-line text-base leading-7 text-foreground/80">
            {text}
          </p>
        ) : null}

        {media.length > 0 ? (
          <div className="mt-6">
            <CreatorPostMedia
              alt={title}
              media={media}
              rendition={{ handle, postId: post.id }}
            />
          </div>
        ) : null}

        <div className="mt-6 text-sm text-foreground/60">
          <CreatorPostMetrics post={post} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <CopyLinkButton url={url} />
          {networkLinks.map((link) => (
            <Button
              asChild
              key={link.label}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <a href={link.url} rel="noopener noreferrer" target="_blank">
                View on {link.label}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
          ))}
          <Button asChild variant={ButtonVariant.GHOST} withWrapper={false}>
            <a href={signUpUrl}>Make your own</a>
          </Button>
        </div>

        <div className="mt-10">
          <ProfileSubscribe handle={handle} source="post" sourceRef={post.id} />
        </div>
      </article>
      <RelatedPosts brandId={brand.id} handle={handle} postId={post.id} />
    </>
  );
}
