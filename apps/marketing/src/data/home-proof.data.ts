import { EnvironmentService } from '@services/core/environment.service';

/**
 * The homepage proof: posts that went out through Genfeed on our own brands,
 * and the latest articles on our own profile. Everything is read from the
 * public API; nothing here is written by hand except which brands are ours.
 *
 * Only these brands are shown. A public post from any other brand is never
 * pulled in, so a customer's content cannot reach the homepage by accident.
 * A brand's id is public (the API exposes it on every post).
 */
export interface HomeProofBrand {
  id: string;
  name: string;
  /** Profile slug, which is also the handle in `/@handle/articles/slug`. */
  slug: string;
}

export const HOME_PROOF_BRANDS: readonly HomeProofBrand[] = [
  {
    id: 'wlr7k5gulg4kgjh1oxlqudn0',
    name: 'Shayla Monroe',
    slug: 'itsshaylamonroe',
  },
  { id: 'ttjs5s1oz7l71g89le8n64dk', name: 'Koro', slug: 'koropompom' },
  { id: 'wy5l3sjn6tnnty5bdx6fi0my', name: 'Vincent', slug: 'vincentshipsit' },
];

/** The brand whose articles are listed. */
export const HOME_PROOF_ARTICLE_BRAND = HOME_PROOF_BRANDS[2];

/** Posts shown per brand, so no one brand fills the row. */
export const HOME_PROOF_POSTS_PER_BRAND = 2;
export const HOME_PROOF_ARTICLE_COUNT = 3;

/** The list is cached by the API for 10 minutes; the page follows it. */
export const HOME_PROOF_REVALIDATE_SECONDS = 600;

export interface HomeProofPost {
  brandName: string;
  caption: string;
  id: string;
  label: string;
  platform: string;
  publishedAt: string;
  /** The live post on its platform. */
  url: string;
}

export interface HomeProofArticle {
  coverImageUrl: string | null;
  id: string;
  label: string;
  publishedAt: string;
  /** The article on genfeed.ai. */
  url: string;
}

export interface HomeProofData {
  articles: HomeProofArticle[];
  posts: HomeProofPost[];
}

interface JsonApiResource {
  attributes?: Record<string, unknown>;
  id?: unknown;
  relationships?: {
    brand?: { data?: { id?: unknown } | null } | null;
  } | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'X',
  x: 'X',
  youtube: 'YouTube',
};

const CAPTION_LIMIT = 140;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/g;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A caption as one plain line, without hashtags, cut at a word. */
export function toProofCaption(description: string): string {
  const plain = description
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(HASHTAG_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
  if (plain.length <= CAPTION_LIMIT) {
    return plain;
  }
  const cut = plain.slice(0, CAPTION_LIMIT);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`;
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/** Only a live link to a web page counts as proof. */
function isLiveUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchResources(path: string): Promise<JsonApiResource[]> {
  try {
    const response = await fetch(`${EnvironmentService.apiEndpoint}${path}`, {
      next: { revalidate: HOME_PROOF_REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as { data?: unknown };
    return Array.isArray(body.data) ? (body.data as JsonApiResource[]) : [];
  } catch {
    return [];
  }
}

export function parseProofPosts(
  resources: readonly JsonApiResource[],
): HomeProofPost[] {
  const brandsById = new Map(
    HOME_PROOF_BRANDS.map((brand) => [brand.id, brand]),
  );
  const posts: HomeProofPost[] = [];
  for (const resource of resources) {
    const brandId = text(resource.relationships?.brand?.data?.id);
    const brand = brandsById.get(brandId);
    const attributes = resource.attributes ?? {};
    const id = text(resource.id);
    const url = text(attributes.url);
    const publishedAt = text(attributes.publishedAt);
    const hasPicture = text(attributes.category) === 'IMAGE';
    if (!brand || !id || !publishedAt || !hasPicture || !isLiveUrl(url)) {
      continue;
    }
    posts.push({
      brandName: brand.name,
      caption: toProofCaption(text(attributes.description)),
      id,
      label: text(attributes.label),
      platform: text(attributes.platform),
      publishedAt,
      url,
    });
  }
  return posts;
}

export function parseProofArticles(
  resources: readonly JsonApiResource[],
): HomeProofArticle[] {
  const articles: HomeProofArticle[] = [];
  for (const resource of resources) {
    const attributes = resource.attributes ?? {};
    const id = text(resource.id);
    const slug = text(attributes.slug);
    const label = text(attributes.label);
    const publishedAt = text(attributes.publishedAt);
    if (!id || !slug || !label || !publishedAt) {
      continue;
    }
    const cover = text(attributes.coverImageUrl);
    articles.push({
      coverImageUrl: isLiveUrl(cover) ? cover : null,
      id,
      label,
      publishedAt,
      url: `/@${HOME_PROOF_ARTICLE_BRAND.slug}/articles/${slug}`,
    });
  }
  return articles.slice(0, HOME_PROOF_ARTICLE_COUNT);
}

/**
 * Real posts and articles, or nothing: a failed or empty answer returns empty
 * lists and the section is not rendered. Public posts carry no measured view
 * counts today (#11600), so no number is shown.
 */
export async function loadHomeProof(): Promise<HomeProofData> {
  const [postLists, articles] = await Promise.all([
    Promise.all(
      HOME_PROOF_BRANDS.map(async (brand) =>
        parseProofPosts(
          await fetchResources(
            `/public/posts?brand=${brand.id}&limit=${HOME_PROOF_POSTS_PER_BRAND}`,
          ),
        ).slice(0, HOME_PROOF_POSTS_PER_BRAND),
      ),
    ),
    fetchResources(
      `/public/articles?brand=${HOME_PROOF_ARTICLE_BRAND.id}&limit=${HOME_PROOF_ARTICLE_COUNT}`,
    ),
  ]);
  return {
    articles: parseProofArticles(articles),
    posts: postLists
      .flat()
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  };
}
