import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { normalizeJsonApiRelationshipGraph } from '@genfeedai/helpers/data/json-api/relationship.helper';
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
import { logger } from '@services/core/logger.service';

export type { JsonApiResponseDocument } from '@genfeedai/helpers/data/json-api/json-api.helper';

/**
 * Global singleton instance manager
 * Maps service class name + token to cached instances
 */
class ServiceInstanceManager {
  private static instances = new Map<
    unknown,
    Map<string, BaseService<unknown>>
  >();

  private static getInstanceMap(
    serviceKey: unknown,
  ): Map<string, BaseService<unknown>> {
    let instanceMap = ServiceInstanceManager.instances.get(serviceKey);
    if (!instanceMap) {
      instanceMap = new Map<string, BaseService<unknown>>();
      ServiceInstanceManager.instances.set(serviceKey, instanceMap);
    }

    return instanceMap;
  }

  static get<T extends BaseService<unknown>>(
    serviceKey: unknown,
    token: string,
  ): T | undefined {
    return ServiceInstanceManager.instances.get(serviceKey)?.get(token) as
      | T
      | undefined;
  }

  static set<T extends BaseService<unknown>>(
    serviceKey: unknown,
    token: string,
    instance: T,
  ): void {
    ServiceInstanceManager.getInstanceMap(serviceKey).set(token, instance);
  }

  static clear(serviceKey?: unknown, token?: string): void {
    if (!serviceKey) {
      ServiceInstanceManager.instances.clear();
      return;
    }

    const instancesForService =
      ServiceInstanceManager.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    if (token) {
      instancesForService.delete(token);
      if (instancesForService.size === 0) {
        ServiceInstanceManager.instances.delete(serviceKey);
      }
      return;
    }

    ServiceInstanceManager.instances.delete(serviceKey);
  }

  static clearAll(): void {
    ServiceInstanceManager.instances.clear();
  }

  static clearByToken(serviceKey: unknown, token: string): void {
    const instancesForService =
      ServiceInstanceManager.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    for (const key of [...instancesForService.keys()]) {
      if (keyIncludesTokenPart(key, token)) {
        ServiceInstanceManager.clear(serviceKey, key);
      }
    }
  }
}

const INSTANCE_KEY_SEPARATOR = '\u0001';

function serializeInstanceKeyPart(part: unknown): string {
  if (part === undefined) {
    return 'undefined:';
  }

  if (part === null) {
    return 'null:';
  }

  if (
    typeof part === 'string' ||
    typeof part === 'number' ||
    typeof part === 'boolean' ||
    typeof part === 'bigint'
  ) {
    return `${typeof part}:${String(part)}`;
  }

  if (part instanceof Date) {
    return `date:${part.toISOString()}`;
  }

  if (typeof part === 'object') {
    try {
      return `json:${JSON.stringify(part)}`;
    } catch {
      return `object:${Object.prototype.toString.call(part)}`;
    }
  }

  return `${typeof part}:${String(part)}`;
}

function buildInstanceKey(parts: unknown[]): string {
  return parts.map(serializeInstanceKeyPart).join(INSTANCE_KEY_SEPARATOR);
}

function keyIncludesTokenPart(key: string, token: string): boolean {
  const tokenKey = serializeInstanceKeyPart(token);

  return (
    key === tokenKey ||
    key.startsWith(`${tokenKey}${INSTANCE_KEY_SEPARATOR}`) ||
    key.endsWith(`${INSTANCE_KEY_SEPARATOR}${tokenKey}`) ||
    key.includes(
      `${INSTANCE_KEY_SEPARATOR}${tokenKey}${INSTANCE_KEY_SEPARATOR}`,
    )
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

  static getInstance(this: new (token: string) => any, token: string): any {
    // biome-ignore lint: 'this' refers to the subclass constructor in static context
    const serviceConstructor = this as unknown as new (token: string) => any;
    const serviceKey = serviceConstructor;

    // Check if we have a cached instance for this service + token
    const cached = ServiceInstanceManager.get<BaseService<unknown>>(
      serviceKey,
      token,
    );
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(token);
    ServiceInstanceManager.set(serviceKey, token, instance);

    return instance;
  }

  static getDataServiceInstance<T extends BaseService<unknown>>(
    serviceConstructor: new (...args: any[]) => T,
    ...args: any[]
  ): T {
    const instanceKey = buildInstanceKey(args);
    const serviceKey = serviceConstructor;

    const cached = ServiceInstanceManager.get<T>(serviceKey, instanceKey);
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(...args);
    ServiceInstanceManager.set(serviceKey, instanceKey, instance);

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
      ServiceInstanceManager.clear(serviceConstructor);
      return;
    }

    ServiceInstanceManager.clearByToken(serviceConstructor, token);
  }

  /**
   * Clear all singleton instances (useful for testing)
   */
  static clearAllInstances(): void {
    ServiceInstanceManager.clearAll();
  }

  protected extractResource<D>(document: JsonApiResponseDocument): D {
    return normalizeJsonApiRelationshipGraph(deserializeResource<D>(document));
  }

  protected extractCollection<D>(document: JsonApiResponseDocument): D[] {
    return normalizeJsonApiRelationshipGraph(
      deserializeCollection<D>(document),
    );
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
      this.handleOperationError(operation, error);
    }
  }

  public findAll(query: Record<string, unknown> = {}): Promise<T[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}`,
      this.instance
        .get<JsonApiResponseDocument>('', { params: query })
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

  public findOne(id: string, query: Record<string, unknown> = {}): Promise<T> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${id}`,
      this.instance
        .get<JsonApiResponseDocument>(`/${id}`, { params: query })
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

    // Remove id field completely (shouldn't be in POST requests)
    // The serializer automatically includes id if present, so we must remove it entirely
    // Use hasOwnProperty to check for id even if it's undefined
    const cleanedBody: Record<string, unknown> = {};

    for (const key in body) {
      // Skip id field entirely for POST requests
      if (key === 'id') {
        continue;
      }

      const value = body[key];
      // Only include defined values (exclude undefined, null, and string "undefined")
      if (value !== undefined && value !== null && value !== 'undefined') {
        cleanedBody[key] = value;
      }
    }

    // Explicitly ensure id is not present (defensive check)
    if ('id' in cleanedBody) {
      delete cleanedBody.id;
    }

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
    // Clean body similar to POST - remove undefined/null values
    const cleanedBody: Record<string, unknown> = {};

    for (const key in body) {
      const value = body[key];
      // Only include defined values (exclude undefined, null, and string "undefined")
      if (value !== undefined && value !== null && value !== 'undefined') {
        cleanedBody[key] = value;
      }
    }

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
