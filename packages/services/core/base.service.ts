import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type {
  IHttpError,
  IServiceSerializer,
} from '@genfeedai/contracts/interfaces/utils/error.interface';
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
  isCancelledRequest,
  isServiceOperationError,
  normalizeOperationError,
} from '@services/core/operation-error';
import {
  buildInstanceKey,
  ServiceInstanceManager,
} from '@services/core/service-instance-manager';

export type { JsonApiResponseDocument } from '@services/core/json-api';

const serviceInstances = new ServiceInstanceManager<BaseService<unknown>>();

/**
 * Safety ceiling for {@link BaseService.collectAllPages}: 100 × 50 = 5000 rows.
 * A surface that trips this wants real pagination, not a fetch-all — so it logs
 * instead of walking forever.
 */
const MAX_COLLECTED_PAGES = 50;

/**
 * Base service class for API operations with type-safe request payloads.
 *
 * @typeParam T - The response model type (e.g., Post)
 * @typeParam TCreate - The create request payload type (defaults to Partial<T>)
 * @typeParam TUpdate - The update request payload type (defaults to Partial<T>)
 *
 * @example
 * ```typescript
 * // With typed payloads from @genfeedai/contracts/api-types
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
    const itemSchema = this.itemSchema;
    if (itemSchema) {
      items.forEach((item: Partial<T>, index: number) => {
        try {
          TypeValidator.assertType(item, itemSchema, `item[${index}]`);
        } catch (error) {
          logger.error('Item validation failed', { error, index, item });
          throw error;
        }
      });
    }

    return items.map((item) => new this.model(item));
  };

  protected mapPage = async (
    document: JsonApiResponseDocument,
  ): Promise<IPaginatedResponse<T>> => {
    const items = await this.mapMany(document);
    const pagination = document.links?.pagination;
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.limit ?? items.length;
    const total = pagination?.total ?? items.length;
    const totalPages = Math.max(1, pagination?.pages ?? 1);

    return {
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      items,
      page,
      pageSize,
      total,
      totalPages,
    };
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
    if (isServiceOperationError(error)) {
      throw error;
    }

    const structuredError = normalizeOperationError(operation, error);
    const httpError = error as IHttpError;
    const method = httpError?.config?.method?.toUpperCase();
    const url = httpError?.config?.url;
    const summary = [
      method,
      url,
      structuredError.status,
      structuredError.message,
    ]
      .filter(Boolean)
      .join(' · ');

    logger.error(`${operation} failed — ${summary}`, {
      reportToSentry: false,
      tags: {
        error_category: structuredError.category ?? 'service_operation',
        operation,
      },
    });

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
    return this.findAllPage(query, signal).then((result) => {
      if ((query as { page?: number }).page) {
        PagesService.setCurrentPage(result.page);
        PagesService.setTotalPages(result.totalPages);
        PagesService.setTotalDocs(result.total);
      }

      return result.items;
    });
  }

  /**
   * Walk every page of a list endpoint and return the flattened rows.
   *
   * HTTP list endpoints are always paginated server-side: `BaseQueryDto` does
   * not accept a `pagination` query flag, and `QueryDefaultsUtil` always
   * returns `pagination: true` so no public endpoint can be talked into an
   * unbounded `findMany`. A caller that genuinely needs the whole
   * collection therefore has to ask for the pages, which is what this does.
   *
   * Subclasses whose collection lives on a custom path (`me/brands`, a
   * relationship route, …) pass their own page fetcher; everything on the
   * standard collection path should use {@link findAllPages} instead.
   */
  protected async collectAllPages<D>(
    query: Record<string, unknown>,
    fetchPage: (
      pageQuery: Record<string, unknown>,
    ) => Promise<{ items: D[]; totalPages: number }>,
  ): Promise<D[]> {
    const requestedLimit =
      typeof query.limit === 'number' && query.limit > 0
        ? query.limit
        : MAX_PAGE_SIZE;
    const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);

    const collected: D[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await fetchPage({ ...query, limit, page });
      collected.push(...result.items);
      totalPages = Math.max(1, result.totalPages);
      page += 1;
    } while (page <= totalPages && page <= MAX_COLLECTED_PAGES);

    if (totalPages > MAX_COLLECTED_PAGES) {
      logger.warn('Fetch-all stopped at the page ceiling', {
        maxPages: MAX_COLLECTED_PAGES,
        totalPages,
        url: this.baseURL,
      });
    }

    return collected;
  }

  /**
   * Every row of this collection, across all server pages.
   *
   * Use this instead of `findAll({ pagination: false })`: that flag is still
   * accepted for backward compatibility but is ignored by the API, so
   * `findAll` returns a single page of 10 rows.
   */
  public findAllPages(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T[]> {
    return this.collectAllPages<T>(query, (pageQuery) =>
      this.findAllPage(pageQuery, signal),
    );
  }

  public findAllPage(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<T>> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}`,
      this.instance
        .get<JsonApiResponseDocument>('', { params: query, signal })
        .then((response) => this.mapPage(response.data)),
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
   * // Type-safe with @genfeedai/contracts/api-types
   * const post = await postsService.post({
   *   credentialId: '...', // Required - TypeScript enforces this
   *   label: '...',
   *   description: '...',
   *   targetExecutionState: TargetExecutionState.DRAFT,
   *   visibility: PostVisibility.PUBLIC,
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
   * // Type-safe with @genfeedai/contracts/api-types
   * const post = await postsService.patch(id, {
   *   description: 'Updated description',
   *   targetExecutionState: TargetExecutionState.SCHEDULED,
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
