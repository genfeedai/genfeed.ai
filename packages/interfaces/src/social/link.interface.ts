import { LinkCategory } from '@genfeedai/enums';
import type { IBaseEntity, IBrand } from '../index';

export interface ILink extends IBaseEntity {
  brand?: IBrand;

  label: string;
  category: LinkCategory;
  url: string;
}
