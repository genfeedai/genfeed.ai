import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IconType, IModel } from '@genfeedai/contracts/interfaces';
import {
  Braces,
  Cpu,
  FileText,
  Film,
  Image,
  ImagePlus,
  Mic2,
  Music,
  Scaling,
  ScanLine,
  Scissors,
  SquareUser,
} from 'lucide-react';

const MODEL_CATEGORY_ICONS: Record<ModelCategory, IconType> = {
  [ModelCategory.EMBEDDING]: Braces,
  [ModelCategory.IMAGE]: Image,
  [ModelCategory.IMAGE_EDIT]: ImagePlus,
  [ModelCategory.IMAGE_UPSCALE]: ScanLine,
  [ModelCategory.MUSIC]: Music,
  [ModelCategory.TEXT]: FileText,
  [ModelCategory.VIDEO]: Film,
  [ModelCategory.VIDEO_EDIT]: Scissors,
  [ModelCategory.VIDEO_UPSCALE]: Scaling,
  [ModelCategory.VOICE]: Mic2,
};

const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  [ModelCategory.EMBEDDING]: 'Embedding',
  [ModelCategory.IMAGE]: 'Image',
  [ModelCategory.IMAGE_EDIT]: 'Image editing',
  [ModelCategory.IMAGE_UPSCALE]: 'Image upscaling',
  [ModelCategory.MUSIC]: 'Music',
  [ModelCategory.TEXT]: 'Text',
  [ModelCategory.VIDEO]: 'Video',
  [ModelCategory.VIDEO_EDIT]: 'Video editing',
  [ModelCategory.VIDEO_UPSCALE]: 'Video upscaling',
  [ModelCategory.VOICE]: 'Voice',
};

type ModelCategoryIconContext = Partial<Pick<IModel, 'key' | 'capabilities'>>;

const AVATAR_MODEL_KEYS = new Set<string>([
  MODEL_KEYS.ARGIL_ATOM,
  MODEL_KEYS.HEYGEN_AVATAR,
  MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
]);

const AVATAR_CAPABILITIES = new Set(['avatar', 'ai_avatar']);

function isAvatarModelContext(context?: ModelCategoryIconContext): boolean {
  if (context?.key && AVATAR_MODEL_KEYS.has(context.key)) {
    return true;
  }

  return (
    context?.capabilities?.some((capability) =>
      AVATAR_CAPABILITIES.has(capability),
    ) ?? false
  );
}

export function getModelCategoryIcon(
  category?: string,
  context?: ModelCategoryIconContext,
): IconType {
  if (category === 'avatar' || isAvatarModelContext(context)) {
    return SquareUser;
  }

  return MODEL_CATEGORY_ICONS[category as ModelCategory] ?? Cpu;
}

export function getModelCategoryLabel(
  category?: string,
  context?: ModelCategoryIconContext,
): string {
  if (category === 'avatar' || isAvatarModelContext(context)) {
    return 'Avatar';
  }

  return (
    MODEL_CATEGORY_LABELS[category as ModelCategory] ?? category ?? 'Unknown'
  );
}
