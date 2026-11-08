import { getEditorialArticleCoverUrl } from '@data/editorial-og.data';
import {
  creatorArticlePath,
  GENFEED_BRAND_HANDLE,
} from '@genfeedai/contracts/constants';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { EnvironmentService } from '@services/core/environment.service';
import type { Metadata } from 'next';
import { getPublicBrandBySlug } from '../../creator-loader';
import { getCreatorArticleCached } from './article-loader';

/**
 * Ahrefs flags a `<title>` over 63 characters as "Title too long", and Google
 * truncates around the same width. Long headlines used to get the site suffix
 * appended unconditionally, which pushed the Show HN / Product Hunt article to
 * 77 characters. Drop the suffix before it overflows, then trim on a word
 * boundary if the headline alone still exceeds the budget.
 */
const TITLE_MAX_LENGTH = 63;

export function buildArticlePageTitle(articleTitle: string): string {
  const suffixed = `${articleTitle} | ${metadata.name}`;

  if (suffixed.length <= TITLE_MAX_LENGTH) {
    return suffixed;
  }

  // `String.length` and `String.slice` count UTF-16 code units, so clipping a
  // headline containing an astral character (an emoji, say) mid-pair leaves a
  // lone surrogate in the `<title>`. Measure and cut on code points instead.
  const codePoints = Array.from(articleTitle);

  if (codePoints.length <= TITLE_MAX_LENGTH) {
    return articleTitle;
  }

  const clipped = codePoints.slice(0, TITLE_MAX_LENGTH - 1).join('');
  const lastSpace = clipped.lastIndexOf(' ');

  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/**
 * Shared by the public route and its preview sibling so a draft renders the
 * same head as the article it will become.
 */
export async function buildPublicArticleMetadata(
  requestedHandle: string,
  slug: string,
  previewToken?: string,
): Promise<Metadata> {
  const article = await getCreatorArticleCached(
    requestedHandle,
    slug,
    previewToken,
  );

  if (!article) {
    return {
      description: 'The article you are looking for does not exist.',
      robots: { follow: false, index: false },
      title: `Article not found`,
    };
  }

  const handle = requestedHandle.toLowerCase();
  const brand = await getPublicBrandBySlug(handle).catch(() => null);
  const articleUrl = `${EnvironmentService.apps.website}${creatorArticlePath(handle, slug)}`;
  // The article's own banner is what a share shows. Without one, the composed
  // card (`og/route.tsx`) draws the headline over a cover generated from the
  // slug, so no two articles unfurl as the same link.
  const coverUrl = getEditorialArticleCoverUrl(slug, article.coverImageUrl);
  const articleImage = coverUrl
    ? { url: coverUrl }
    : { height: 630, type: 'image/png', url: `${articleUrl}/og`, width: 1200 };
  // Coerce missing strings so metadata helpers never see undefined values
  // (GENFEED-AI-44: trim/string ops on absent article fields).
  const articleTitle =
    typeof article.label === 'string' && article.label.trim().length > 0
      ? article.label.trim()
      : 'Article';
  const articleDescription =
    typeof article.summary === 'string' && article.summary.trim().length > 0
      ? article.summary.trim()
      : articleTitle;
  const twitterCreator = brand?.twitterHandle
    ? `@${brand.twitterHandle}`
    : handle === GENFEED_BRAND_HANDLE
      ? '@genfeedai'
      : undefined;

  return {
    alternates: {
      canonical: articleUrl,
    },
    description: articleDescription,
    openGraph: {
      description: articleDescription,
      images: { alt: articleTitle, ...articleImage },
      siteName: metadata.name,
      title: articleTitle,
      type: 'article',
      url: articleUrl,
      ...(article.publishedAt && { publishedTime: article.publishedAt }),
      ...(article.updatedAt && { modifiedTime: article.updatedAt }),
    },
    title: buildArticlePageTitle(articleTitle),
    twitter: {
      card: 'summary_large_image',
      creator: twitterCreator,
      description: articleDescription,
      images: [articleImage.url],
      title: articleTitle,
    },
  };
}
