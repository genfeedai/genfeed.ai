import type { IngredientFormat } from '@genfeedai/enums';

interface ImageMergeStoryboard {
  format: IngredientFormat;
}

export interface ImageMergePromptBarProps {
  storyboard: ImageMergeStoryboard;
  onFormatChange: (format: IngredientFormat) => void;
  onMergeImages: () => void;
  onClearAll: () => void;
  isMerging?: boolean;
  canMerge?: boolean;
  totalFrames: number;
  completedFrames: number;
  mergePrompt: string;
  onMergePromptChange: (value: string) => void;
}
