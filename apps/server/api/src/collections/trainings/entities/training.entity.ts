import { Training } from '@api/collections/trainings/schemas/training.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  TrainingCategory,
  TrainingProvider,
  TrainingStatus,
} from '@genfeedai/enums';

export class TrainingEntity extends BaseEntity implements Training {
  declare readonly organization: string;
  declare readonly user: string;
  declare readonly brand?: string;

  declare readonly sources: string[];

  declare readonly label: string;
  declare readonly description?: string;
  declare readonly trigger: string;
  declare readonly category: TrainingCategory;
  declare readonly status?: TrainingStatus;
  declare readonly steps: number;
  declare readonly seed?: number;
  declare readonly provider?: TrainingProvider;

  // External provider training ID (set once training is initiated)
  declare readonly externalId?: string;
  declare readonly model: string;

  declare readonly baseModel?: string;

  declare readonly isActive: boolean;

  // Virtual fields
  declare readonly totalGeneratedImages?: number;
  declare readonly totalSources?: number;
}
