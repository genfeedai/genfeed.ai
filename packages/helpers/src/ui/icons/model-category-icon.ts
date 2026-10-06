import { ModelCategory } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces';
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

export function getModelCategoryIcon(category?: string): IconType {
  return MODEL_CATEGORY_ICONS[category as ModelCategory] ?? Cpu;
}

export function getModelCategoryLabel(category?: string): string {
  return (
    MODEL_CATEGORY_LABELS[category as ModelCategory] ?? category ?? 'Unknown'
  );
}
