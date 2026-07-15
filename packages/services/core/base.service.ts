import type {
  IHttpError,
  IServiceSerializer,
  IStructuredError,
} from '@genfeedai/interfaces/utils/error.interface';
import { ErrorHandler } from '@genfeedai/utils/error/error-handler.util';
import {
  TypeValidator,
  type ValidationSchema,
} from '@genfeedai/utils/validation/type-validator.util';
import { PagesService } from '@services/content/pages.service';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';
import {
  buildInstanceKey,
  ServiceInstanceManager,
} from '@services/core/service-instance-manager';

export type { JsonApiResponseDocument } from '@services/core/json-api';

const serviceInstances = new ServiceInstanceManager<BaseService<unknown>>();

function isCancelledRequest(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isCancelled' in error &&
    error.isCancelled === true
  );
}

/**
 * Base service class for API operations with type-safe request payloads.
 *
 * @typeParam T - The response model type (e.g., Post)
 * @typeParam TCreate - The create request payload type (defaults to Partial<T>)
 * @typeParam TUpdate - The update request payload type (defaults to Partial<T>)
 *
 * @example
 * ```typescript
 * // With typed payloads from @genfeedai/api-types
 * class PostsService extends BaseService<Post, CreatePostRequest, UpdatePostRequest> {
 *   // post() and patch() now require correctly typed payloads
 * }
 * ```
 */
export abstract class BaseService<
  T,
  TCreate = Partial<T>,
  TUpdate = Partial<T>,
> extends HTTPBaseService {
  // Override in child classes to provide response validation
  protected responseSchema?: ValidationSchema;
  protected itemSchema?: ValidationSchema;

  constructor(
    endpoint: string,
    token: string,
    public readonly model: new (partial: Partial<T>) => T,
    readonly _serializer: IServiceSerializer<T>,
  ) {
    // Automatically construct full URL from EnvironmentService.apiEndpoint + endpoint
    super(`${EnvironmentService.apiEndpoint}${endpoint}`, token);
  }

  static getInstance(token: string): BaseService<unknown> {
    // biome-ignore lint/complexity: static factory must preserve the subclass constructor for singleton caching.
    const serviceConstructor = this as unknown as new (
      token: string,
    ) => BaseService<unknown>;

    // Check if we have a cached instance for this service + token
    const cached = serviceInstances.get<BaseService<unknown>>(
      serviceConstructor,
      token,
    );
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(token);
    serviceInstances.set(serviceConstructor, token, instance);

    return instance;
  }

  static getDataServiceInstance<
    T extends BaseService<unknown>,
    TArgs extends unknown[],
  >(serviceConstructor: new (...args: TArgs) => T, ...args: TArgs): T {
    const instanceKey = buildInstanceKey(args);
    const serviceKey = serviceConstructor;

    const cached = serviceInstances.get<T>(serviceKey, instanceKey);
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(...args);
    serviceInstances.set(serviceKey, instanceKey, instance);

    return instance;
  }

  /**
   * Clear singleton instance for specific token
   */
  static clearInstance(...args: unknown[]): void {
    const [firstArg, secondArg] = args;
    const hasConstructor = typeof firstArg === 'function';
    const serviceConstructor =
      // biome-ignore lint: this refers to the subclass constructor, not BaseService
      (hasConstructor ? firstArg : this) as new (
        token: string,
      ) => BaseService<unknown>;
    const token = hasConstructor
      ? (secondArg as string | undefined)
      : (firstArg as string | undefined);

    if (!token) {
      serviceInstances.clear(serviceConstructor);
      return;
    }

    serviceInstances.clearByToken(serviceConstructor, token);
  }

  /**
   * Strip a request payload of empty values before sending it to the API.
   *
   * Drops keys whose value is `undefined`, `null`, or the literal string
   * `'undefined'` (the last leaks in from query-string coercion). Pass
   * `{ excludeId: true }` for POST requests, which must never carry an `id`
   * — the serializer would otherwise echo it back into the create payload.
   */
  protected static cleanBody<TBody>(
    body: TBody,
    options: { excludeId?: boolean } = {},
  ): Record<string, unknown> {
    const cleanedBody: Record<string, unknown> = {};

    for (const key in body) {
      if (options.excludeId && key === 'id') {
        continue;
      }

      const value = body[key];
      if (value !== undefined && value !== null && value !== 'undefined') {
        cleanedBody[key] = value;
      }
    }

    return cleanedBody;
  }

  /**
   * Clear all singleton instances (useful for testing)
   */
  static clearAllInstances(): void {
    serviceInstances.clearAll();
  }

  protected extractResource<D>(document: JsonApiResponseDocument): D {
    return extractResource<D>(document);
  }

  protected extractCollection<D>(document: JsonApiResponseDocument): D[] {
    return extractCollection<D>(document);
  }

  protected mapMany = async (
    document: JsonApiResponseDocument,
  ): Promise<T[]> => {
    const items = this.extractCollection<Partial<T>>(document);

    // Validate array structure
    if (!TypeValidator.isArray(items)) {
      logger.error('Invalid response: expected array', { response: document });
      throw new TypeError('Invalid API response: expected array of items');
    }

    // Validate each item if schema is provided
    if (this.itemSchema) {
      items.forEach((item: Partial<T>, index: number) => {
        try {
          TypeValidator.assertType(item, this.itemSchema!, `item[${index}]`);
        } catch (error) {
          logger.error('Item validation failed', { error, index, item });
          throw error;
        }
      });
    }

    return items.map((item) => new this.model(item));
  };

  protected mapOne = async (document: JsonApiResponseDocument): Promise<T> => {
    const data = this.extractResource<Partial<T>>(document);

    // Validate response if schema is provided
    if (this.responseSchema) {
      try {
        TypeValidator.assertType(data, this.responseSchema, 'response');
      } catch (error) {
        logger.error('Response validation failed', { error, response: data });
        throw error;
      }
    }

    return new this.model(data as Partial<T>);
  };

  protected handleOperationError(
    operation: string,
    error: IHttpError | unknown,
  ): never {
    // Use standardized error handler
    const errorDetails = ErrorHandler.extractErrorDetails(error);
    const httpError = error as IHttpError;
    const statusCode =
      httpError?.response?.status || errorDetails.status || 500;

    const method = httpError?.config?.method?.toUpperCase();
    const url = httpError?.config?.url;
    const summary = [method, url, statusCode, errorDetails.message]
      .filter(Boolean)
      .join(' · ');

    logger.error(`${operation} failed — ${summary}`, {
      reportToSentry: false,
    });

    // Create a structured error that includes all details
    const structuredError = new Error(errorDetails.message) as IStructuredError;
    structuredError.code = errorDetails.code;
    structuredError.status = statusCode;
    structuredError.validationErrors = errorDetails.validationErrors?.reduce(
      (acc, error) => {
        if (!acc[error.field]) {
          acc[error.field] = [];
        }
        acc[error.field].push(error.message);
        return acc;
      },
      {} as Record<string, string[]>,
    );
    structuredError.originalError = error;

    throw structuredError;
  }

  protected async executeWithErrorHandling<R>(
    operation: string,
    promise: Promise<R>,
  ): Promise<R> {
    try {
      return await promise;
    } catch (error) {
      // The interceptor marks request cancellations as silent control flow.
      // Preserve that marker so callers can ignore stale requests without a
      // misleading 500 log or a generic structured error wrapper.
      if (isCancelledRequest(error)) {
        throw error;
      }

      this.handleOperationError(operation, error);
    }
  }

  public findAll(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}`,
      this.instance
        .get<JsonApiResponseDocument>('', { params: query, signal })
        .then((res) => res.data)
        .then(async (res) => {
          const page = (query as { page?: number }).page;
          const pagination = res.links?.pagination;

          if (page && pagination) {
            PagesService.setCurrentPage(pagination.page);
            PagesService.setTotalPages(pagination.pages);
            PagesService.setTotalDocs(pagination.total || 0);
          }

          return await this.mapMany(res);
        }),
    );
  }

  public findOne(
    id: string,
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${id}`,
      this.instance
        .get<JsonApiResponseDocument>(`/${id}`, { params: query, signal })
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  /**
   * Create a new resource
   *
   * @param body - The create payload (typed as TCreate when specified)
   * @returns Promise resolving to the created resource
   *
   * @example
   * ```typescript
   * // Type-safe with @genfeedai/api-types
   * const post = await postsService.post({
   *   credential: '...', // Required - TypeScript enforces this
   *   label: '...',
   *   description: '...',
   *   status: PostStatus.DRAFT,
   * });
   * ```
   */
  public post(body: TCreate): Promise<T>;
  public post(path: string, body: TCreate): Promise<T>;
  public post(...args: unknown[]): Promise<T> {
    const body = args[args.length - 1] as TCreate;

    // Remove id field completely (shouldn't be in POST requests) — the
    // serializer automatically includes id if present, so it must not be here.
    const cleanedBody = BaseService.cleanBody(body, { excludeId: true });

    const url =
      args.length > 1 && typeof args[0] === 'string' ? `/${args[0]}` : '';

    return this.executeWithErrorHandling(
      `POST ${this.baseURL}${url}`,
      this.instance
        .post<JsonApiResponseDocument>(url, cleanedBody)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  /**
   * Update an existing resource
   *
   * @param id - The resource ID
   * @param body - The update payload (typed as TUpdate when specified)
   * @returns Promise resolving to the updated resource
   *
   * @example
   * ```typescript
   * // Type-safe with @genfeedai/api-types
   * const post = await postsService.patch(id, {
   *   description: 'Updated description',
   *   status: PostStatus.SCHEDULED,
   * });
   * ```
   */
  public patch(id: string, body: TUpdate): Promise<T> {
    // Clean body similar to POST, but keep id (it's the patch target).
    const cleanedBody = BaseService.cleanBody(body);

    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}`, cleanedBody)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  public delete(id: string): Promise<T> {
    return this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${id}`,
      this.instance
        .delete<JsonApiResponseDocument>(`/${id}`)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }
}
