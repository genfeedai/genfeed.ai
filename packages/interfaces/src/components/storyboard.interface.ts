import type { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
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
