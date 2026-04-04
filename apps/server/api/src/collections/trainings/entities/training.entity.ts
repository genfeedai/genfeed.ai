import { Training } from '@api/collections/trainings/schemas/training.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  TrainingCategory,
  TrainingProvider,
  TrainingStatus,
} from '@genfeedai/enums';
import { Types } from 'mongoose';

export class TrainingEntity extends BaseEntity implements Training {
  declare readonly organization: Types.ObjectId;
  declare readonly user: Types.ObjectId;
  declare readonly brand?: Types.ObjectId;

  declare readonly sources: Types.ObjectId[];

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
