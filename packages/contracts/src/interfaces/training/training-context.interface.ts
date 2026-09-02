import type { ITraining } from '../index';

export interface TrainingContextType {
  training: ITraining;
  refreshTraining: () => Promise<void>;
}
