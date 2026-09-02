import type {
  IngredientCategory,
  IngredientStatus,
  VideoEaseCurve,
  VideoTransition,
} from '../..';
import type { IIngredient } from '../index';

export interface IStoryboardStep {
  status: string;
  description: string;
}

export interface IStoryboardStepsProps {
  steps: IStoryboardStep[];
}

export interface IStoryboardSummaryProps {
  ingredient: IIngredient;
  title?: string;
  description?: string;
}

export interface StoryboardFrame {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt: string;
  status: IngredientStatus[];
  category: IngredientCategory;
}

/**
 * The merge-time settings the storyboard workspace exposes. Mirrors the merge
 * fields of `storyboardSchema` so both merge paths (scene clips and hand-picked
 * videos) send the same options instead of hardcoding defaults.
 */
export interface IStoryboardMergeSettings {
  isCaptionsEnabled: boolean;
  isMuteVideoAudio?: boolean;
  transition?: VideoTransition;
  transitionDuration?: number;
  transitionEaseCurve?: VideoEaseCurve;
}

/**
 * In-flight position of a scene-generation run. `total` is the size of the
 * batch that was started, not the storyboard's frame count.
 */
export interface IStoryboardSceneProgress {
  current: number;
  total: number;
}
