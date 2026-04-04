import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ModelCategory,
  ModelKey,
  ModelProvider,
  Platform,
} from '@genfeedai/enums';
import type { IBrand, IOrganization, IPreset } from '@genfeedai/interfaces';

export class Preset extends BaseEntity implements IPreset {
  public declare organization?: IOrganization | string;
  public declare brand?: IBrand | string;
  public declare label: string;
  public declare description: string;
  public declare prompt?: string;
  public declare key: string;
  public declare category: ModelCategory;
  public declare model?: ModelKey;
  public declare provider?: ModelProvider;
  public declare platform?: Platform;
  public declare defaultCamera?: string;
  public declare defaultMoods?: string[];
  public declare defaultScene?: string;
  public declare defaultStyle?: string;
  public declare defaultBlacklists?: string[];
  public declare isActive: boolean;
  public declare isFavorite?: boolean;

  constructor(data: Partial<IPreset> = {}) {
    super(data);
  }
}
