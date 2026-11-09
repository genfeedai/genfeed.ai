import type { IMetadata } from '@genfeedai/contracts/interfaces';
import type { Ingredient } from '@models/content/ingredient.model';
import type {
  ArticleBodySegment,
  ArticleGenerationBlockData,
} from '@props/content/public-article.props';

/** A whole generation block as the sanitizer serializes it. */
const GENERATION_BLOCK_PATTERN =
  /<figure\b[^>]*\bdata-genfeed-generation="(?:image|video)"[^>]*>[\s\S]*?<\/figure>/gi;
const INGREDIENT_ID_PATTERN = /\bdata-ingredient-id="([\w-]+)"/i;
/** The metadata column's default: not something the author wrote. */
const PLACEHOLDER_DESCRIPTION = 'Default Description';

/**
 * Cuts a sanitized article body at its generation blocks, so the blocks can
 * render as components between the stretches of prose. A block without an
 * asset id is dropped.
 */
export function splitArticleBody(html: string): ArticleBodySegment[] {
  const segments: ArticleBodySegment[] = [];
  let cursor = 0;
  for (const match of html.matchAll(GENERATION_BLOCK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({
        html: html.slice(cursor, start),
        key: `html-${cursor}`,
        kind: 'html',
      });
    }
    const ingredientId = match[0].match(INGREDIENT_ID_PATTERN)?.[1];
    if (ingredientId) {
      segments.push({
        ingredientId,
        key: `generation-${start}`,
        kind: 'generation',
      });
    }
    cursor = start + match[0].length;
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
