import type { TrainingCategory, TrainingStatus } from '@genfeedai/enums';
import type {
  IBaseEntity,
  IBrand,
  IImage,
  IOrganization,
  IUser,
} from '../index';

export interface ITraining extends IBaseEntity {
  organization?: IOrganization | string;
  brand?: IBrand | string;
  user: IUser | string;
  sources?: IImage[] | string[];
  label: string;
  description?: string;
  model?: string;
  provider?: string;
  trigger: string;
  status?: TrainingStatus;
  steps?: number;
  category?: TrainingCategory;
  externalId?: string;
  isActive?: boolean;
  totalSources?: number;
  totalGeneratedImages?: number;
}
