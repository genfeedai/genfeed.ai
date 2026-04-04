import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { logger } from '~utils/logger.util';
import { ServiceInstanceManager } from '~utils/service-instance-manager.util';

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
      timeout: 30_000,
    });

    this.token = token;

    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();
  }

  static getInstance<T extends HTTPBaseService>(
    serviceConstructor: new (...args: unknown[]) => T,
    ...args: unknown[]
  ): T {
    const serviceName = serviceConstructor.name;
    const token = args.length === 2 ? (args[1] as string) : (args[0] as string);

    const cached = ServiceInstanceManager.get<T>(serviceName, token);
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(...args);
    ServiceInstanceManager.set(serviceName, token, instance);

    return instance;
  }

  static clearInstance(serviceName: string, token?: string): void {
    if (token) {
      ServiceInstanceManager.clear(serviceName, token);
    } else {
      ServiceInstanceManager.clearAll();
    }
  }

  static clearAllInstances(): void {
    ServiceInstanceManager.clearAll();
  }

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

    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    config.signal = this.abortController.signal;

    return config;
  };

  private handleError = (error: AxiosError) => {
    if (
      error.code === 'ERR_CANCELED' ||
      error.message === 'canceled' ||
      error.message?.includes('abort')
    ) {
      return Promise.reject({ isCancelled: true, silent: true });
    }

    const response = error.response;
    const request = error.config;

    logger.error('HTTP request failed', error.message, {
      data: response?.data,
      method: request?.method,
      status: response?.status,
      url: request?.url,
    });

    if (!response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        const timeoutError = new Error(
          'Request timed out. Please check your connection and try again.',
        ) as Error & { isTimeout: boolean };
        timeoutError.isTimeout = true;
        throw timeoutError;
      }

      const networkError = new Error(
        'Network error. Please check your connection and try again.',
      ) as Error & { isNetworkError: boolean };
      networkError.isNetworkError = true;
      throw networkError;
    }

    if (response.status === 401) {
      const authError = new Error(
        'Authentication failed. Please sign in again.',
      ) as Error & { isAuthError: boolean };
      authError.isAuthError = true;
      throw authError;
    }

    throw response?.data || error;
  };

  public setToken(newToken: string) {
    this.token = newToken;
  }
}
