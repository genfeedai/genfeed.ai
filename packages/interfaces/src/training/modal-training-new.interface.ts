import type { IngredientStatus } from '@genfeedai/enums';

export interface ModalTrainingNewProps {
  onSuccess?: () => void;
}

export type TrainingStatusUpdate = {
  trainingId: string;
  status: IngredientStatus;
  metadata?: { error?: string };
};
