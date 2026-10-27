import type { ModelCategory, ModelProvider, Platform } from '../..';
import type { AdPreset } from '../../api-types/contracts/ad-preset.contract';
import type { B2bPlaybook } from '../../api-types/contracts/b2b-playbook.contract';
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
  adPreset?: AdPreset;
  playbook?: B2bPlaybook;
  key: string;
  category: ModelCategory;
  model?: string;
  provider?: ModelProvider;
  platform?: Platform;

  camera?: string;
  aspectRatio?: string;
  duration?: number;
  promptTemplate?: string;
  lighting?: string;
  lens?: string;
  cameraMovement?: string;
  mood?: string;
  scene?: string;
  style?: string;
  blacklists?: string[];

  thumbnailUrl?: string;

  isActive: boolean;
  isFavorite?: boolean;
}
