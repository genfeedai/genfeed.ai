import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class TrainingEntity extends BaseEntity implements TrainingDocument {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;
  declare readonly personaId: string | null;
  declare readonly label: TrainingDocument['label'];
  declare readonly description: TrainingDocument['description'];
  declare readonly externalId: TrainingDocument['externalId'];
  declare readonly stage: TrainingDocument['stage'];
  declare readonly config: TrainingDocument['config'];
  declare readonly isDeleted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  declare readonly _id: string;
  declare readonly organization?: string;
  declare readonly user?: string;
  declare readonly brand?: string | null;

  declare readonly sources?: string[];
  declare readonly category?: string | null;
  declare readonly status?: string | null;
  declare readonly steps?: number | null;
  declare readonly seed?: number | null;
  declare readonly provider?: string | null;
  declare readonly trigger?: string | null;
  declare readonly model?: string | null;
  declare readonly baseModel?: string | null;
  declare readonly totalGeneratedImages?: number;
  declare readonly totalSources?: number;
}
