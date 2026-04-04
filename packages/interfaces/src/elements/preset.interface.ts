import type {
  ModelCategory,
  ModelKey,
  ModelProvider,
  Platform,
} from '@genfeedai/enums';
import type { IBaseEntity, IBrand, IOrganization } from '../index';

export interface IPreset extends IBaseEntity {
  organization?: IOrganization | string;
  brand?: IBrand | string;
  ingredient?: string;

  label: string;
  description: string;
  prompt?: string;
  key: string;
  category: ModelCategory;
  model?: ModelKey;
  provider?: ModelProvider;
  platform?: Platform;

  camera?: string;
  mood?: string;
  scene?: string;
  style?: string;
  blacklists?: string[];

  thumbnailUrl?: string;

  isActive: boolean;
  isFavorite?: boolean;
}
