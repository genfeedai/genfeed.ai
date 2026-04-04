import type { IQueryParams } from '../index';

export interface BrandQueryParams extends IQueryParams {
  limit?: number;
  page?: number;
  sort?: string;
}
