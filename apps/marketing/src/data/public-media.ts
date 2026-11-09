import type {
  IBrand,
  IIngredient,
  IMetadata,
} from '@genfeedai/contracts/interfaces';
import { buildUntrustedAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { EnvironmentService } from '@services/core/environment.service';

/** A public image or video as the gallery reads it. */
export interface PublicMediaFacts {
  brand?: IBrand | string | null;
  brandId?: string | null;
  metadata?: IMetadata | string | null;
  model?: string | null;
}

export type PublicMediaKind = 'image' | 'video';

function metadataOf(item: PublicMediaFacts): IMetadata | undefined {
  return item.metadata && typeof item.metadata === 'object'
    ? item.metadata
    : undefined;
}

/** The id of the creator brand that owns the item. */
export function mediaBrandId(item: PublicMediaFacts): string | undefined {
  if (typeof item.brand === 'string') {
    return item.brand;
  }
  return item.brand?.id ?? item.brandId ?? undefined;
}

/** The key of the model that made the item: its own, else its metadata's. */
export function mediaModelKey(item: PublicMediaFacts): string | undefined {
  return item.model || metadataOf(item)?.model || undefined;
}

/** A video's length in whole seconds, when it is known. */
export function mediaDurationSeconds(
  item: PublicMediaFacts,
): number | undefined {
  const duration = metadataOf(item)?.duration;
  return typeof duration === 'number' && duration > 0
    ? Math.round(duration)
    : undefined;
}

/** `8` reads `0:08`, `65` reads `1:05`. */
export function formatMediaDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

const compactCount = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

/** `1284` reads `1.3K`. */
export function formatCompactCount(count: number): string {
  return compactCount.format(count);
}

/** A public asset's address, for handing the work itself to the agent. */
export function publicMediaUrl(media: IIngredient): string | undefined {
  return media.ingredientUrl || media.cdnUrl || undefined;
}

/**
 * The agent prompt behind "Recreate in Genfeed": same kind, same model, where
 * it was seen, and the work itself as a reference.
 */
export function buildRecreatePrompt(
  kind: PublicMediaKind,
  source: {
    handle?: string;
    isFeatured?: boolean;
    modelLabel?: string;
    url?: string;
  },
): string {
  const seenAt = source.isFeatured
    ? 'the one featured on genfeed.ai/community'
    : source.handle
      ? `@${source.handle}'s on genfeed.ai`
      : 'the one I saw on genfeed.ai';
  const model = source.modelLabel ? ` with ${source.modelLabel}` : '';
  const noun = kind === 'image' ? 'an image' : 'a video';
  const reference = source.url ? `. Reference: ${source.url}` : '';
  return `Make ${noun} like ${seenAt}${model}${reference}`;
}

/**
 * Opens the Genfeed agent with the recreate prompt filled in. The prompt
 * carries public creator data, so the agent runs in manual mode and asks
 * before spending credits.
 */
export function buildRecreateHref(prompt: string): string {
  return `${EnvironmentService.apps.app}${buildUntrustedAgentPromptHref(prompt)}`;
}
