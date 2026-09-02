import type { LinkCategory } from '../..';
import type { IBaseEntity, IBrand } from '../index';

export interface ILink extends IBaseEntity {
  brandId: string;
  brand?: IBrand;

  label: string;
  category: LinkCategory;
  url: string;
}
