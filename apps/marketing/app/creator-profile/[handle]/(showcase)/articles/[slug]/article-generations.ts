import type { IMetadata } from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@models/content/ingredient.model';
import type {
  ArticleBodySegment,
  ArticleCompareData,
  ArticleGenerationBlockData,
} from '@props/content/public-article.props';

/** A whole generation block as the sanitizer serializes it. */
const GENERATION_BLOCK_PATTERN =
  /<figure\b[^>]*\bdata-genfeed-generation="(?:image|video)"[^>]*>[\s\S]*?<\/figure>/gi;
const INGREDIENT_ID_PATTERN = /\bdata-ingredient-id="([\w-]+)"/i;
/** A before/after figure as the sanitizer serializes it. */
const COMPARE_BLOCK_PATTERN =
  /<figure\b[^>]*\bdata-genfeed-compare\b[^>]*>[\s\S]*?<\/figure>/gi;
const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;
const FIGCAPTION_PATTERN = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i;
/** The metadata column's default: not something the author wrote. */
const PLACEHOLDER_DESCRIPTION = 'Default Description';

const HTML_ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&#x27;', "'"],
  // Last, so `&amp;lt;` decodes to the text `&lt;` and no further.
  ['&amp;', '&'],
];

function decodeAttribute(value: string): string {
  return HTML_ENTITIES.reduce(
    (decoded, [entity, character]) => decoded.replaceAll(entity, character),
    value,
  );
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return match ? decodeAttribute(match[1]) : null;
}

function readDimension(tag: string, name: 'height' | 'width') {
  const value = Number.parseInt(readAttribute(tag, name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * A before/after figure holds exactly two images, the "before" first. Anything
 * else (one image, three images, an image without a source) is not a
 * comparison, so it stays ordinary article HTML.
 */
function parseCompareBlock(figure: string): ArticleCompareData | null {
  const [before, after, ...rest] = figure.match(IMG_TAG_PATTERN) ?? [];
  if (!before || !after || rest.length > 0) {
    return null;
  }
  const beforeSrc = readAttribute(before, 'src');
  const afterSrc = readAttribute(after, 'src');
  if (!beforeSrc || !afterSrc) {
    return null;
  }
  return {
    after: { alt: readAttribute(after, 'alt') ?? 'After', src: afterSrc },
    before: { alt: readAttribute(before, 'alt') ?? 'Before', src: beforeSrc },
    captionHtml: figure.match(FIGCAPTION_PATTERN)?.[1]?.trim() || null,
    height: readDimension(before, 'height'),
    width: readDimension(before, 'width'),
  };
}

interface ArticleBlockMatch {
  end: number;
  segment: ArticleBodySegment | null;
  start: number;
}

function findBlocks(html: string): ArticleBlockMatch[] {
  const generations = [...html.matchAll(GENERATION_BLOCK_PATTERN)].map(
    (match): ArticleBlockMatch => {
      const start = match.index ?? 0;
      const ingredientId = match[0].match(INGREDIENT_ID_PATTERN)?.[1];
      return {
        end: start + match[0].length,
        // A block without an asset id is dropped.
        segment: ingredientId
          ? { ingredientId, key: `generation-${start}`, kind: 'generation' }
          : null,
        start,
      };
    },
  );
  const compares = [...html.matchAll(COMPARE_BLOCK_PATTERN)].flatMap(
    (match): ArticleBlockMatch[] => {
      const start = match.index ?? 0;
      const compare = parseCompareBlock(match[0]);
      return compare
        ? [
            {
              end: start + match[0].length,
              segment: { compare, key: `compare-${start}`, kind: 'compare' },
              start,
            },
          ]
        : [];
    },
  );
  return [...generations, ...compares].sort((a, b) => a.start - b.start);
}

/**
 * Cuts a sanitized article body at its generation and compare blocks, so the
 * blocks can render as components between the stretches of prose.
 */
export function splitArticleBody(html: string): ArticleBodySegment[] {
  const segments: ArticleBodySegment[] = [];
  let cursor = 0;
  for (const block of findBlocks(html)) {
    if (block.start > cursor) {
      segments.push({
        html: html.slice(cursor, block.start),
        key: `html-${cursor}`,
        kind: 'html',
      });
    }
    if (block.segment) {
      segments.push(block.segment);
    }
    cursor = block.end;
  }
  if (cursor < html.length) {
    segments.push({
      html: html.slice(cursor),
      key: `html-${cursor}`,
      kind: 'html',
    });
  }
  return segments;
}

/**
 * The blocks the API returned, keyed by asset id and reduced to what the page
 * renders. An asset without a deliverable URL is left out, so its block does
 * not draw a broken frame.
 */
export function buildRecreatePrompt(
  generation: Pick<
    ArticleGenerationBlockData,
    'kind' | 'modelLabel' | 'prompt'
  >,
): string | null {
  if (!generation.prompt) {
    return null;
  }
  const model = generation.modelLabel ? ` with ${generation.modelLabel}` : '';
  return `Recreate this ${generation.kind}${model}: ${generation.prompt}`;
}

export function toArticleGenerationBlocks(
  ingredients: readonly Ingredient[],
  modelLabels: Readonly<Record<string, string>>,
): Record<string, ArticleGenerationBlockData> {
  return Object.fromEntries(
    ingredients.flatMap((ingredient) => {
      const url = ingredient.ingredientUrl;
      if (!url) {
        return [];
      }
      const metadata =
        typeof ingredient.metadata === 'object'
          ? (ingredient.metadata as IMetadata)
          : undefined;
      const modelKey = metadata?.model || null;
      const block: ArticleGenerationBlockData = {
        description:
          metadata?.description?.trim() &&
          metadata.description.trim() !== PLACEHOLDER_DESCRIPTION
            ? metadata.description.trim()
            : null,
        height: metadata?.height,
        id: ingredient.id,
        kind:
          String(ingredient.category).toLowerCase() === 'video'
            ? 'video'
            : 'image',
        label: metadata?.label?.trim() || 'Generation',
        modelKey,
        modelLabel: modelKey ? (modelLabels[modelKey] ?? null) : null,
        prompt: ingredient.promptText.trim() || null,
        url,
        width: metadata?.width,
      };
      return [[ingredient.id, block]];
    }),
  );
}
