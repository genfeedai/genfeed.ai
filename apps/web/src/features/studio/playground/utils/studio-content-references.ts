import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { UploadStatus } from '@genfeedai/contracts';
import { hasInterpolation } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { isAutoStudioModelKey } from '@genfeedai/pricing';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import type { ImageEditEntryResolution } from '@/features/studio/playground/utils/studio-image-edit-entry';
import { resolveStudioAssetUrl } from '@/features/studio/playground/utils/studio-playground-asset';
import { studioIngredientAccessibleLabel } from '@/features/studio/playground/utils/studio-playground-recipe';
import { getStudioReferenceKind } from '@/features/studio/playground/utils/studio-reference-selection';

export interface StudioContentReference {
  item: ContentMentionItem;
  role: StudioPlaygroundReferenceRole;
}

export const EMPTY_KNOWLEDGE_SELECTION: KnowledgeSelection = {};
export const EMPTY_ATTACHMENTS: AttachmentItem[] = [];

// Auto defers to the router, which can pick a start/end-frame model, so a
// start and end frame may be attached together. A concrete model decides.
export function resolveSupportsInterpolation(
  modelKey: string | undefined,
  videoControls: CrunInputControls | undefined,
): boolean {
  if (isAutoStudioModelKey(modelKey)) {
    return true;
  }
  return videoControls?.mediaKind === 'video'
    ? videoControls.videoRules?.referenceMode === 'start-end'
    : hasInterpolation(modelKey ?? '');
}

export function warnForImageEditEntry(
  entry: ImageEditEntryResolution,
  messages: {
    model: (model: string) => string;
    ratio: (ratio: string) => string;
  },
  warn: (message: string) => void,
): void {
  if (entry.replacedModelKey) warn(messages.model(entry.replacedModelKey));
  if (entry.droppedAspectRatio) warn(messages.ratio(entry.droppedAspectRatio));
}

export function toContentReference(
  asset: IIngredient,
  role: StudioPlaygroundReferenceRole,
): StudioContentReference | null {
  const isAudio = getStudioReferenceKind(String(asset.category)) === 'audio';
  if ((role === 'audioReference') !== isAudio) return null;
  const thumbnailUrl = isAudio ? undefined : resolveStudioAssetUrl(asset);
  if (isAudio ? !asset.s3Key : !thumbnailUrl) {
    return null;
  }

  return {
    item: {
      brandId: asset.brandId ?? null,
      contentTitle: studioIngredientAccessibleLabel(asset),
      contentType: String(asset.category),
      id: asset.id,
      thumbnailUrl,
    },
    role,
  };
}

/** A composer upload restored from the draft: already a Library asset. */
export function toRestoredAttachment(
  asset: IIngredient,
): AttachmentItem | null {
  const kind = getStudioReferenceKind(String(asset.category));
  const url = resolveStudioAssetUrl(asset);
  if (!url && !(kind === 'audio' && asset.s3Key)) {
    return null;
  }

  return {
    id: asset.id,
    ingredientId: asset.id,
    kind,
    name: studioIngredientAccessibleLabel(asset),
    previewUrl: url ?? '',
    status: UploadStatus.COMPLETED,
    url,
  };
}
