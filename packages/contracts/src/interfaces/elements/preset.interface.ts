import type { ModelCategory, ModelProvider, Platform } from '../..';
import type { IBaseEntity, IBrand, IOrganization } from '../index';

export interface IPreset extends IBaseEntity {
  organization?: IOrganization | string;
  brand?: IBrand | string;
  organizationId?: string | null;
  brandId?: string | null;
  ingredientId?: string;

  label: string;
  description: string;
  prompt?: string;
  key: string;
  category: ModelCategory;
  model?: string;
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
