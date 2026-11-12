import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

const HTML_TAGS_PATTERN = /<[^>]*>/g;
const WHITESPACE_RUN_PATTERN = /\s+/g;
const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  threads: 'Threads',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

/** Post copy can carry editor HTML; cards and meta tags need plain text. */
export function toPlainPostText(value: string | undefined): string {
  return (value ?? '')
    .replace(HTML_TAGS_PATTERN, ' ')
    .replace(WHITESPACE_RUN_PATTERN, ' ')
    .trim();
}

/** "Posted on X", or nothing for a post published on Genfeed itself. */
export function postPlatformLabel(platform: string | undefined): string | null {
  if (!platform) {
    return null;
  }
  return PLATFORM_LABELS[platform.toLowerCase()] ?? null;
}

/** A post's title: its label, else the opening words of its copy. */
export function postTitle(label: string | undefined, text: string): string {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) {
    return trimmedLabel;
  }
  if (text.length <= 80) {
    return text || 'Post';
  }
  const clipped = text.slice(0, 79);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export interface CreatorPostMediaItem {
  height?: number;
  id: string;
  kind: 'image' | 'video';
  url: string;
  width?: number;
}

type MediaSource = Pick<IIngredient, 'category' | 'id' | 'status'> & {
  height?: number;
  ingredientUrl?: string;
  width?: number;
};

const KIND_BY_CATEGORY: Partial<Record<string, CreatorPostMediaItem['kind']>> =
  {
    [IngredientCategory.GIF]: 'image',
    [IngredientCategory.IMAGE]: 'image',
    [IngredientCategory.VIDEO]: 'video',
  };

/**
 * The images and videos a post renders with, in posting order. Media that is
 * still processing, failed, or has no deliverable URL is left out rather than
 * drawn as a broken frame.
 */
export function getPostMedia(
  ingredients: readonly MediaSource[] | undefined,
): CreatorPostMediaItem[] {
  return (ingredients ?? []).flatMap((ingredient) => {
    const kind =
      KIND_BY_CATEGORY[String(ingredient.category ?? '').toUpperCase()];
    const url = ingredient.ingredientUrl ?? '';
    if (
      !kind ||
      !url ||
      ingredient.status === IngredientStatus.PROCESSING ||
      ingredient.status === IngredientStatus.FAILED
    ) {
      return [];
    }
    return [
      {
        height: ingredient.height,
        id: ingredient.id,
        kind,
        url,
        width: ingredient.width,
      },
    ];
  });
}
