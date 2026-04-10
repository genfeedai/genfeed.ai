import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { IErrorDebugInfo } from '@genfeedai/interfaces/modals/error-debug.interface';
import type {
  IHttpCancelledError,
  IHttpInterceptorError,
  IHttpSanitizedError,
} from '@genfeedai/interfaces/utils/http-interceptor-error.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { setErrorDebugInfo } from '@services/core/error-debug-store';
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

function createInterceptorError(
  message: string,
  type: 'isTimeout' | 'isNetworkError' | 'isAuthError',
  debugInfo: IErrorDebugInfo,
): IHttpInterceptorError {
  const error = new Error(message) as IHttpInterceptorError;
  error[type] = true;
  error.debugInfo = debugInfo;
  return error;
}

/**
 * Global singleton instance manager for HTTP services
 * Maps service class name + token to cached instances
 *
 * IMPORTANT: Call clearAll() on logout/sign-out to prevent stale token usage
 */
class HTTPServiceInstanceManager {
  private static instances = new Map<unknown, Map<string, HTTPBaseService>>();

  private static getInstanceMap(
    serviceKey: unknown,
  ): Map<string, HTTPBaseService> {
    let instanceMap = HTTPServiceInstanceManager.instances.get(serviceKey);
    if (!instanceMap) {
      instanceMap = new Map<string, HTTPBaseService>();
      HTTPServiceInstanceManager.instances.set(serviceKey, instanceMap);
    }

    return instanceMap;
  }

  static get<T>(serviceKey: unknown, token: string): T | undefined {
    return HTTPServiceInstanceManager.instances.get(serviceKey)?.get(token) as
      | T
      | undefined;
  }

  static set<T>(serviceKey: unknown, token: string, instance: T): void {
    HTTPServiceInstanceManager.getInstanceMap(serviceKey).set(
      token,
      instance as HTTPBaseService,
    );
  }

  static clear(serviceKey?: unknown, token?: string): void {
    if (!serviceKey) {
      HTTPServiceInstanceManager.instances.clear();
      return;
    }

    const instancesForService =
      HTTPServiceInstanceManager.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    if (token) {
      instancesForService.delete(token);
      if (instancesForService.size === 0) {
        HTTPServiceInstanceManager.instances.delete(serviceKey);
      }
      return;
    }

    HTTPServiceInstanceManager.instances.delete(serviceKey);
  }

  static clearAll(): void {
    HTTPServiceInstanceManager.instances.clear();
  }

  static clearByToken(serviceKey: unknown, token: string): void {
    const instancesForService =
      HTTPServiceInstanceManager.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    for (const key of [...instancesForService.keys()]) {
      if (keyIncludesTokenPart(key, token)) {
        HTTPServiceInstanceManager.clear(serviceKey, key);
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
 * Clear all cached HTTP service instances
 * Call this on logout/sign-out to prevent stale token usage
 */
export function clearAllServiceInstances(): void {
  HTTPServiceInstanceManager.clearAll();
}

export abstract class HTTPBaseService {
  protected instance: AxiosInstance;
  protected token: string;
  protected readonly baseURL: string;
  private abortController: AbortController | null = null;

  public constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.instance = axios.create({
      baseURL,
      paramsSerializer: (params) => {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value === null || value === undefined) {
            continue;
          }

          if (Array.isArray(value)) {
            for (const item of value) {
              if (item === null || item === undefined) {
                continue;
              }

              searchParams.append(key, String(item));
            }
          } else {
            searchParams.append(key, String(value));
          }
        }

        return searchParams.toString();
      },
      timeout: 30_000, // 10 second timeout - fail fast if API is unreachable
    });

    this.token = token;

    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();
  }

  static getInstance(this: new (token: string) => any, token: string): any {
    const serviceConstructor = HTTPBaseService as unknown as new (
      token: string,
    ) => any;
    const serviceKey = serviceConstructor;

    // Check if we have a cached instance for this service + token
    const cached = HTTPServiceInstanceManager.get<any>(serviceKey, token);
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(token);
    HTTPServiceInstanceManager.set(serviceKey, token, instance);

    return instance;
  }

  static getBaseServiceInstance<T extends HTTPBaseService>(
    serviceConstructor: new (...args: any[]) => T,
    ...args: any[]
  ): T {
    const instanceKey = buildInstanceKey(args);

    const cached = HTTPServiceInstanceManager.get<T>(
      serviceConstructor,
      instanceKey,
    );
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(...args);
    HTTPServiceInstanceManager.set(serviceConstructor, instanceKey, instance);

    return instance;
  }

  /**
   * Clear singleton instance for specific token
   */
  static clearInstance(...args: unknown[]): void {
    const [firstArg, secondArg] = args;
    const hasConstructor = typeof firstArg === 'function';
    const serviceConstructor = (
      hasConstructor ? firstArg : HTTPBaseService
    ) as abstract new (
      ...ctorArgs: unknown[]
    ) => HTTPBaseService;
    const token = hasConstructor
      ? (secondArg as string | undefined)
      : (firstArg as string | undefined);

    if (!token) {
      HTTPServiceInstanceManager.clear(serviceConstructor);
      return;
    }

    HTTPServiceInstanceManager.clearByToken(serviceConstructor, token);
  }

  /**
   * Clear all singleton instances (useful for testing)
   */
  static clearAllInstances(): void {
    HTTPServiceInstanceManager.clearAll();
  }

  /**
   * Cancel all pending requests
   */
  public cancelPendingRequests(): void {
    if (this.abortController) {
      this.abortController.abort('Request cancelled');
      this.abortController = null;
    }
  }

  private initializeRequestInterceptor = () => {
    this.instance.interceptors.request.use(this.handleRequest);
  };

  private initializeResponseInterceptor = () => {
    this.instance.interceptors.response.use((res) => res, this.handleError);
  };

  private handleRequest = (config: InternalAxiosRequestConfig) => {
    config.headers.Authorization = `Bearer ${this.token}`;

    // Don't auto-cancel previous requests - let them complete naturally
    // Only cancel if explicitly called via cancelPendingRequests()
    // This prevents race conditions when multiple components load simultaneously

    // Create abort controller for manual cancellation if needed
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    config.signal = this.abortController.signal;

    return config;
  };

  private handleError = async (error: AxiosError) => {
    // Silently ignore cancelled/aborted requests - check FIRST before any logging
    if (
      error.code === 'ERR_CANCELED' ||
      error.message === 'canceled' ||
      error.message?.includes('abort')
    ) {
      // Don't throw or log - request was intentionally cancelled
      return Promise.reject<IHttpCancelledError>({
        isCancelled: true,
        silent: true,
      });
    }

    const response = error.response;
    const request = error.config;

    // Capture detailed error information for debugging
    const debugInfo: IErrorDebugInfo = {
      context: {
        baseURL: request?.baseURL,
        timeout: request?.timeout,
      },
      errorCode: error.code,
      message: error.message,
      method: request?.method,
      request: {
        body: request?.data,
        headers: request?.headers as Record<string, string>,
        params: request?.params,
      },
      response: {
        data: response?.data,
      },
      stack: error.stack,
      status: response?.status,
      statusText: response?.statusText,
      timestamp: new Date().toISOString(),
      url: request?.url,
    };

    // Store error info and optionally show debug modal
    setErrorDebugInfo(debugInfo);

    if (!EnvironmentService.isProduction) {
      const shouldShowDebugModal =
        typeof window !== 'undefined' &&
        response?.status &&
        response.status >= 400 &&
        response.status !== 422;

      if (shouldShowDebugModal) {
        openModal(ModalEnum.ERROR_DEBUG);
      }
    }

    if (!response) {
      // Network error or timeout
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw createInterceptorError(
          'Request timed out. Please check your connection and try again.',
          'isTimeout',
          debugInfo,
        );
      }

      // Network connection error
      throw createInterceptorError(
        'Network error. Please check your connection and try again.',
        'isNetworkError',
        debugInfo,
      );
    }

    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Don't auto-logout, let the app handle it
      throw createInterceptorError(
        'Authentication failed. Please sign in again.',
        'isAuthError',
        debugInfo,
      );
    }

    // In production, sanitize error data
    if (EnvironmentService.isProduction && response?.data) {
      const sanitizedError: IHttpSanitizedError = {
        message: 'An error occurred',
        status: response.status || 500,
        statusText: response.statusText || 'Internal Server Error',
      };

      // Check for JSON API error format (from NestJS backend)
      if (
        typeof response.data === 'object' &&
        'errors' in response.data &&
        Array.isArray((response.data as Record<string, unknown>).errors)
      ) {
        // Preserve JSON API error format but sanitize if needed
        const errors = (response.data as Record<string, unknown>)
          .errors as Array<Record<string, unknown>>;
        if (errors.length > 0) {
          const firstError = errors[0];
          // Only include safe error messages
          if (
            firstError.detail &&
            typeof firstError.detail === 'string' &&
            !firstError.detail.includes('\n') &&
            firstError.detail.length < 200
          ) {
            // Pass through the JSON API error format
            throw response.data;
          }
        }
      }

      throw sanitizedError;
    }

    // In development, propagate full error details
    throw response?.data || error;
  };

  public setToken(newToken: string) {
    this.token = newToken;
  }
}
