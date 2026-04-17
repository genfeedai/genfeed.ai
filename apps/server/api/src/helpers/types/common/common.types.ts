// Base pagination query interface
export interface BasePaginationQuery {
  page?: number;
  limit?: number;
  pagination?: boolean;
  sort?: string;
  isDeleted?: boolean;
}

// Base entity interface
export interface BaseEntity {
  _id: string;
  user: string;
  organization?: string;
  brand?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

// Document type pattern for entity compatibility
export type EntityDocument<T> = T & { _id: string; [key: string]: unknown };

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Generic query filters
export interface QueryFilters {
  search?: string;
  status?: string; // Use domain-specific status enums in actual usage
  type?: string;
  userId?: string;
  organizationId?: string;
  isDeleted?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
}

// Bulk operation result
export interface BulkOperationResult {
  success: boolean;
  totalProcessed: number;
  successful: number;
  failed: number;
  errors?: string[];
}

// File upload result
export interface FileUploadResult {
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  url: string;
  key?: string;
}

// Service operation context
export interface OperationContext {
  userId: string;
  organizationId?: string;
  requestId?: string;
  userAgent?: string;
  ipAddress?: string;
}

// Generic update result
export interface UpdateResult {
  modifiedCount: number;
  matchedCount: number;
  acknowledged: boolean;
}

// Error details
export interface ErrorDetails {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
  timestamp: string;
}

// Webhook payload
export interface WebhookPayload<T = unknown> {
  id: string;
  type: string;
  timestamp: string;
  data: T;
  source: string;
  version: string;
}
