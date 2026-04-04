import { EnvironmentService } from '~services/environment.service';
import { HTTPBaseService } from '~services/http-base.service';
import { logger } from '~utils/logger.util';
import { ServiceInstanceManager } from '~utils/service-instance-manager.util';

export interface JsonApiResponseDocument {
  data?: unknown;
  included?: unknown[];
  meta?: Record<string, unknown>;
  links?: {
    pagination?: {
      page: number;
      pages: number;
      total?: number;
    };
  };
  errors?: Array<{
    status: string;
    title: string;
    detail: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
  }>;
}

/**
 * Clean request body by removing undefined, null values
 * Optionally removes 'id' field for POST requests
 */
function cleanRequestBody<T>(
  body: Partial<T>,
  options: { skipId?: boolean } = {},
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const key in body) {
    if (options.skipId && key === 'id') {
      continue;
    }

    const value = body[key as keyof T];
    if (value !== undefined && value !== null && value !== 'undefined') {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export interface IServiceSerializer<T> {
  serialize(data: Partial<T>): unknown;
  deserialize(data: unknown): Partial<T>;
}

export interface IServiceConstructor<T> {
  new (token: string): T;
  getInstance(token: string): T;
  clearInstance(token?: string): void;
}

interface JsonApiResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

/**
 * Simple JSON-API deserializer
 * Extracts data from JSON-API response format
 */
function deserializeResource<D>(document: JsonApiResponseDocument): D {
  if (!document.data) {
    throw new Error('Invalid JSON-API response: missing data');
  }

  const data = document.data as JsonApiResource;

  // If data has attributes, flatten them
  if (data.attributes) {
    return {
      id: data.id,
      type: data.type,
      ...data.attributes,
      ...data.relationships,
    } as D;
  }

  return data as D;
}

function deserializeCollection<D>(document: JsonApiResponseDocument): D[] {
  if (!Array.isArray(document.data)) {
    throw new Error('Invalid JSON-API response: data is not an array');
  }

  return document.data.map((item: unknown) => {
    if (typeof item === 'object' && item !== null && 'attributes' in item) {
      const { id, type, attributes, relationships } = item as JsonApiResource;
      return {
        id,
        type,
        ...attributes,
        ...relationships,
      } as D;
    }
    return item as D;
  });
}

export abstract class BaseService<T> extends HTTPBaseService {
  constructor(
    endpoint: string,
    token: string,
    public readonly model: new (partial: Partial<T>) => T,
  ) {
    // Automatically construct full URL from EnvironmentService.apiEndpoint + endpoint
    super(`${EnvironmentService.apiEndpoint}${endpoint}`, token);
  }

  /**
   * Get singleton instance of service for given token
   * Creates new instance if token changes to prevent token leaks
   */
  static getInstance<T>(this: IServiceConstructor<T>, token: string): T {
    const serviceConstructor = BaseService as IServiceConstructor<T>;
    const serviceName = serviceConstructor.name;

    // Check if we have a cached instance for this service + token
    const cached = ServiceInstanceManager.get<T>(serviceName, token);
    if (cached) {
      return cached;
    }

    const instance = new serviceConstructor(token);
    ServiceInstanceManager.set(serviceName, token, instance);

    return instance;
  }

  /**
   * Clear singleton instance for specific token
   */
  static clearInstance<T>(this: IServiceConstructor<T>, token?: string): void {
    const serviceConstructor = BaseService as IServiceConstructor<T>;
    const serviceName = serviceConstructor.name;

    if (token) {
      ServiceInstanceManager.clear(serviceName, token);
    } else {
      ServiceInstanceManager.clearAll();
    }
  }

  /**
   * Clear all singleton instances (useful for testing)
   */
  static clearAllInstances(): void {
    ServiceInstanceManager.clearAll();
  }

  protected extractResource<D>(document: JsonApiResponseDocument): D {
    return deserializeResource<D>(document);
  }

  protected extractCollection<D>(document: JsonApiResponseDocument): D[] {
    return deserializeCollection<D>(document);
  }

  protected mapMany = (document: JsonApiResponseDocument): T[] => {
    const items = this.extractCollection<Partial<T>>(document);

    if (!Array.isArray(items)) {
      logger.error('Invalid response: expected array', document, {
        service: 'BaseService',
      });
      throw new TypeError('Invalid API response: expected array of items');
    }

    return items.map((item) => new this.model(item));
  };

  protected mapOne = (document: JsonApiResponseDocument): T => {
    const data = this.extractResource<Partial<T>>(document);
    return new this.model(data as Partial<T>);
  };

  protected handleOperationError(operation: string, error: unknown): never {
    const err = error as Record<string, unknown> | null;
    const errorMessage =
      (err?.message as string) || (err?.detail as string) || 'Unknown error';
    const response = err?.response as Record<string, unknown> | undefined;
    const statusCode =
      (response?.status as number) || (err?.status as number) || 500;

    logger.error(`${operation} failed`, errorMessage, {
      operation,
      service: 'BaseService',
      statusCode,
    });

    const structuredError = new Error(errorMessage) as Error & {
      status: number;
      originalError: unknown;
    };
    structuredError.status = statusCode;
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
        .then(async (res) => await this.mapMany(res)),
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

  public post(...args: unknown[]): Promise<T> {
    const body = args[args.length - 1] as Partial<T>;
    const cleanedBody = cleanRequestBody(body, { skipId: true });
    const url =
      args.length > 1 && typeof args[0] === 'string' ? `/${args[0]}` : '';

    return this.executeWithErrorHandling(
      `POST ${this.baseURL}${url}`,
      this.instance
        .post<JsonApiResponseDocument>(url, cleanedBody)
        .then((res) => res.data)
        .then((res) => this.mapOne(res)),
    );
  }

  public patch(id: string, body: Partial<T>): Promise<T> {
    const cleanedBody = cleanRequestBody(body);

    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}`, cleanedBody)
        .then((res) => res.data)
        .then((res) => this.mapOne(res)),
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
