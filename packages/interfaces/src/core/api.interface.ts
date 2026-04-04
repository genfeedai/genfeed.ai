import type { IPaginationParams } from '../index';

export interface IApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  links?: {
    pagination?: IPaginationParams;
  };
}

export interface IPaginatedResponse<T = unknown> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface IApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
  method?: string;
  statusCode?: number;
}

export interface IApiRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface IService {
  baseUrl: string;
  headers: Record<string, string>;
  setAuthToken(token: string): void;
  clearAuthToken(): void;
}

export interface ICrudService<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>
  extends IService {
  getAll(options?: IApiRequestOptions): Promise<T[]>;
  getById(id: string, options?: IApiRequestOptions): Promise<T>;
  create(data: CreateDTO, options?: IApiRequestOptions): Promise<T>;
  update(id: string, data: UpdateDTO, options?: IApiRequestOptions): Promise<T>;
  delete(id: string, options?: IApiRequestOptions): Promise<void>;
}

export interface ISerializer<Input = unknown, Output = unknown> {
  serialize(data: Input): Output;
  deserialize(data: Output): Input;
  serializeMany(data: Input[]): Output[];
  deserializeMany(data: Output[]): Input[];
}

export interface ICreatePayload<T = unknown> {
  data: T;
}

export interface IUpdatePayload<T = unknown> {
  id: string;
  data: Partial<T>;
}

export interface IBatchPayload<T = unknown> {
  ids: string[];
  data?: T;
}

export interface IQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  brand?: string | number | boolean;
  type?: string | number | boolean;
  format?: string | number | boolean;
  search?: string;
  filters?: Record<string, unknown>;
  pagination?: boolean;
  fields?: string[];
  include?: string[];
  exclude?: string[];
  [key: string]: unknown;
}

export interface IWebhookPayload<T = unknown> {
  event: string;
  data: T;
  timestamp: string;
  signature?: string;
}

export interface IUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface IUploadOptions extends IApiRequestOptions {
  onProgress?: (progress: IUploadProgress) => void;
  maxSize?: number;
  allowedTypes?: string[];
}

export interface IUploadResponse {
  url: string;
  publicId?: string;
  size: number;
  category: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface IBatchOperationResult<T = unknown> {
  successful: T[];
  failed: Array<{
    item: T;
    error: IApiError;
  }>;
  total: number;
  successCount: number;
  failureCount: number;
}
