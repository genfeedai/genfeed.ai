import { Model as BaseModel } from '@genfeedai/client/models';
import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
} from '@genfeedai/helpers/ui/model-badge.helper';

export class Model extends BaseModel {
  public get categoryBadgeClass(): string {
    return getModelCategoryBadgeClass(this.category);
  }

  public get providerBadgeClass(): string {
    return getModelProviderBadgeClass(this.provider);
  }
}
