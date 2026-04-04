import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TrainingCategory, TrainingStatus } from '@genfeedai/enums';
import type {
  IBrand,
  IImage,
  IOrganization,
  ITraining,
  IUser,
} from '@genfeedai/interfaces';

export class Training extends BaseEntity implements ITraining {
  public declare organization?: IOrganization | string;
  public declare brand?: IBrand | string;
  public declare user: IUser | string;
  public declare sources?: IImage[] | string[];
  public declare label: string;
  public declare description?: string;
  public declare model?: string;
  public declare provider?: string;
  public declare trigger: string;
  public declare status?: TrainingStatus;
  public declare steps?: number;
  public declare category?: TrainingCategory;
  public declare externalId?: string;
  public declare isActive?: boolean;
  public declare totalSources?: number;
  public declare totalGeneratedImages?: number;

  constructor(data: Partial<ITraining> = {}) {
    super(data);
  }
}
