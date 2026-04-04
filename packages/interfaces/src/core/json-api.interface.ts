/**
 * JSON:API specification types for standardized API responses
 * @see https://jsonapi.org/format/
 */

/**
 * JSON:API links object for navigation
 */
export interface JsonApiLinks {
  self?: string;
  first?: string;
  last?: string;
  prev?: string;
  next?: string;
  related?: string;
}

/**
 * JSON:API meta object for pagination and additional information
 */
export interface JsonApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  [key: string]: unknown; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON:API spec allows arbitrary meta
}

/**
 * JSON:API relationship object
 */
export interface JsonApiRelationship {
  data?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
  links?: JsonApiLinks;
  meta?: JsonApiMeta;
}

/**
 * JSON:API resource identifier object
 */
export interface JsonApiResourceIdentifier {
  type: string;
  id: string;
  meta?: JsonApiMeta;
}

/**
 * JSON:API resource object with generic attributes type
 * @template T - The type of the resource attributes
 */
export interface JsonApiResource<T = unknown> {
  type: string;
  id: string;
  attributes?: T;
  relationships?: Record<string, JsonApiRelationship>;
  links?: JsonApiLinks;
  meta?: JsonApiMeta;
}

/**
 * JSON:API single resource response
 * @template T - The type of the resource attributes
 */
export interface JsonApiSingleResponse<T = unknown> {
  data: JsonApiResource<T> | null;
  included?: JsonApiResource[];
  links?: JsonApiLinks;
  meta?: JsonApiMeta;
}

/**
 * JSON:API collection response for lists and paginated results
 * @template T - The type of the resource attributes
 */
export interface JsonApiCollectionResponse<T = unknown> {
  data: JsonApiResource<T>[];
  included?: JsonApiResource[];
  links?: JsonApiLinks;
  meta?: JsonApiMeta;
}

/**
 * Union type for a single or collection response
 */
export type JsonApiResult<T = unknown> =
  | JsonApiSingleResponse<T>
  | JsonApiCollectionResponse<T>;

/**
 * Promise-returning JSON:API result helper
 */
export type JsonApiResponsePromise<T = unknown> = Promise<JsonApiResult<T>>;

/**
 * JSON:API error object
 */
export interface JsonApiError {
  id?: string;
  status?: string;
  code?: string;
  title?: string;
  detail?: string;
  source?: {
    pointer?: string;
    parameter?: string;
    header?: string;
  };
  meta?: JsonApiMeta;
}

/**
 * JSON:API error response
 */
export interface JsonApiErrorResponse {
  errors: JsonApiError[];
  meta?: JsonApiMeta;
  links?: JsonApiLinks;
}

/**
 * Union type for any JSON:API response
 */
export type JsonApiResponse<T = unknown> =
  | JsonApiSingleResponse<T>
  | JsonApiCollectionResponse<T>
  | JsonApiErrorResponse;
