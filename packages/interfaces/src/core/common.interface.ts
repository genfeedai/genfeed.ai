import { IngredientCategory } from '@genfeedai/enums';

export interface IFieldOption {
  value: IngredientCategory | string;
  label: string;
}

export interface INumericOption {
  value: number;
  label: string;
}

export interface ILabeledItem {
  id: string;
  label: string;
}

export interface IKeyValue<T = string> {
  key: string;
  value: T;
}

export interface IBulkOperationResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface IBulkPatchData {
  type: string;
  ids: string[];
  isRead?: boolean;
  isDeleted?: boolean;
}

export interface IStatistic {
  title: string;
  value: number;
  unit?: string;
  change?: number;
}

export interface IErrorDetails {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IPaginationParams {
  page: number;
  limit: number;
  total?: number;
  pages: number;
}

export interface ISortParams {
  field: string;
  order: 'asc' | 'desc';
}

export interface IDateRange {
  start: string;
  end: string;
}

/**
 * Base interface for catalog elements (lighting, camera, mood, etc.)
 */
export interface IElementBase {
  key: string;
  label: string;
  description?: string;
}

/**
 * Extended element with active/default flags
 */
export interface IElementWithFlags extends IElementBase {
  isActive?: boolean;
  isDefault?: boolean;
}

/**
 * Common URL response interface
 */
export interface IUrlResponse {
  url: string;
}

/**
 * Common timestamps for non-entity records
 */
export interface ITimestamps {
  createdAt: string;
  updatedAt: string;
}

/**
 * Entity with ID and timestamps (used by non-MongoDB entities)
 */
export interface IIdentifiable extends ITimestamps {
  id: string;
}

/**
 * Common pagination query parameters
 */
export interface IPaginatedQuery {
  page?: number;
  limit?: number;
  sort?: string;
}
