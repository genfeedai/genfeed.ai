import type { ICreatorArticleAccess } from '@genfeedai/contracts/interfaces/billing';

/** One h2 or h3 of an article body, anchored by `id`. */
export interface ArticleSection {
  id: string;
  label: string;
  level: 2 | 3;
}

export interface ArticleSections {
  html: string;
  sections: ArticleSection[];
}

export interface PublicArticleViewProps {
  /** The creator handle in the URL; the article must belong to it. */
  handle: string;
  /**
   * Present only on the preview route. The public route never forwards one, so
   * it stays statically renderable.
   */
  previewToken?: string;
  slug: string;
}

export interface PublicArticleRouteParams {
  handle: string;
  slug: string;
}

/**
 * Next resolves a repeated query key to an array, so a caller appending
 * `?previewToken=a&previewToken=b` yields `string[]` here. The article lookup
 * takes a single token, so the route normalizes before crossing that boundary.
 */
export interface PublicArticlePreviewSearchParams {
  previewToken?: string | string[];
}

export interface PublicArticleRouteProps {
  params: Promise<PublicArticleRouteParams>;
}

export interface PublicArticlePreviewRouteProps
  extends PublicArticleRouteProps {
  searchParams: Promise<PublicArticlePreviewSearchParams>;
}

export interface ArticleResource {
  /** Module folder in genfeedai/skills that holds the skill. */
  module: string;
  skill: string;
  label: string;
}

export interface ArticleResourceProps {
  slug: string;
  resource: ArticleResource;
}

export interface ArticleContentProps {
  applyHref: string;
  /** The article's generation blocks, keyed by asset id. */
  generations?: Record<string, ArticleGenerationBlockData>;
  sanitizedHtml: string;
  /** The body's outline, built on the server with the heading anchors. */
  sections?: ArticleSection[];
  slug?: string;
  resource?: ArticleResource | null;
}

export interface ArticleOutlineProps {
  sections: ArticleSection[];
}

/** A Genfeed generation embedded in an article, ready to render. */
export interface ArticleGenerationBlockData {
  /** "What it does": the author's description of the asset. */
  description: string | null;
  height?: number;
  id: string;
  kind: 'image' | 'video';
  label: string;
  modelKey: string | null;
  modelLabel: string | null;
  /** Null when the author hid the prompt. */
  prompt: string | null;
  url: string;
  width?: number;
}

/** An article body cut at its generation blocks, in reading order. */
export type ArticleBodySegment =
  | { html: string; key: string; kind: 'html' }
  | { ingredientId: string; key: string; kind: 'generation' };

export interface ArticleGenerationBlockProps {
  generation: ArticleGenerationBlockData;
}

/**
 * What the paid-article island receives (#9718): the reader's access, and the
 * full body sanitized and outlined on the server once they have it.
 */
export interface ArticleAccessView
  extends Omit<ICreatorArticleAccess, 'content'> {
  full: ArticleSections | null;
}

export interface GatedArticleBodyProps {
  applyHref: string;
  articleId: string;
  /** Generations embedded in the body, keyed by ingredient id. */
  generations?: Record<string, ArticleGenerationBlockData>;
  handle: string;
  /** The preview the website serves to everyone, sanitized on the server. */
  preview: ArticleSections;
  slug: string;
  unlockPriceCredits: number | null;
}
