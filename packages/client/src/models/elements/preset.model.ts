import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ModelCategory,
  ModelProvider,
  Platform,
} from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  IPreset,
} from '@genfeedai/contracts/interfaces';

export class Preset extends BaseEntity implements IPreset {
  declare public organization?: IOrganization | string;
  declare public brand?: IBrand | string;
  declare public label: string;
  declare public description: string;
  declare public prompt?: string;
  declare public key: string;
  declare public category: ModelCategory;
  declare public model?: string;
  declare public provider?: ModelProvider;
  declare public platform?: Platform;
  declare public organizationId?: string | null;
  declare public brandId?: string | null;
  declare public aspectRatio?: string;
  declare public duration?: number;
  declare public promptTemplate?: string;
  declare public lighting?: string;
  declare public lens?: string;
  declare public cameraMovement?: string;
  declare public camera?: string;
  declare public mood?: string;
  declare public scene?: string;
  declare public style?: string;
  declare public defaultCamera?: string;
  declare public defaultMoods?: string[];
  declare public defaultScene?: string;
  declare public defaultStyle?: string;
  declare public defaultBlacklists?: string[];
  declare public isActive: boolean;
  declare public isFavorite?: boolean;

  constructor(data: Partial<IPreset> = {}) {
    super(data);
  }
}
