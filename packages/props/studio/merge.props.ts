import type { StoryboardFrame } from '@genfeedai/client/schemas';
import type { IngredientFormat } from '@genfeedai/enums';

export interface MergeFramesGridProps {
  frames: StoryboardFrame[];
  format: IngredientFormat;
  isMerging: boolean;
  isDragging: boolean;
  onFrameClick: (index: number) => void;
  onRemoveFrame: (index: number) => void;
  onAddFrame: () => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  frameType: 'video' | 'image';
}

export interface MergedResultDisplayProps {
  mergedId: string;
  frameCount: number;
  format: IngredientFormat;
  type: 'video' | 'image';
  onStartNew: () => void;
}

export interface MergeProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress?: number; // 0-100 for active step
}

export interface MergeProgressBarsProps {
  steps: MergeProgressStep[];
  overallProgress?: number; // 0-100 overall progress
  className?: string;
}
