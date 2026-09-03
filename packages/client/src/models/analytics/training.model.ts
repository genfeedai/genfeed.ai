import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TrainingCategory, TrainingStatus } from '@genfeedai/contracts';
import type {
  IBrand,
  IImage,
  IOrganization,
  ITraining,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Training extends BaseEntity implements ITraining {
  declare public organization?: IOrganization | string;
  declare public brand?: IBrand | string;
  declare public user: IUser | string;
  declare public sources?: IImage[] | string[];
  declare public label: string;
  declare public description?: string;
  declare public model?: string;
  declare public provider?: string;
  declare public trigger: string;
  declare public status?: TrainingStatus;
  declare public steps?: number;
  declare public category?: TrainingCategory;
  declare public externalId?: string;
  declare public isActive?: boolean;
  declare public totalSources?: number;
  declare public totalGeneratedImages?: number;

  constructor(data: Partial<ITraining> = {}) {
    super(data);
  }
}
