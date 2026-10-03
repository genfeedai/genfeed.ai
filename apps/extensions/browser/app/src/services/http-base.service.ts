import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  assertWorkspace,
  requireWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';
import { logger } from '~utils/logger.util';
import { ServiceInstanceManager } from '~utils/service-instance-manager.util';

const REQUEST_TIMEOUT_MS = 30_000;

export abstract class HTTPBaseService {
  protected instance: AxiosInstance;
  protected token: string;
  protected readonly baseURL: string;
  private workspace: ExtensionWorkspaceSnapshot | null = null;
  private abortController: AbortController | null = null;

  public constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.instance = axios.create({
      baseURL,
      adapter: async (config) => {
        const workspace = this.workspace ?? (await requireWorkspace());
        this.workspace = workspace;
        assertWorkspace(workspace);
        const url = this.instance.getUri(config);
        // Axios applies `timeout` only inside its built-in adapters, so this
        // custom adapter must enforce it itself.
        const timeoutMs = config.timeout || REQUEST_TIMEOUT_MS;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const cancelSignal = this.abortController?.signal;
        let response: Response;
        let text: string;
        try {
          response = await scopedWorkspaceRequest(
            url,
            {
              method: config.method?.toUpperCase(),
              headers: config.headers.toJSON() as Record<string, string>,
              body: config.data,
              signal: cancelSignal
                ? AbortSignal.any([cancelSignal, timeoutSignal])
                : timeoutSignal,
            },
            workspace,
          );
          text = await response.text();
        } catch (error) {
          if (timeoutSignal.aborted && !cancelSignal?.aborted)
            throw new AxiosError(
              `timeout of ${timeoutMs}ms exceeded`,
              AxiosError.ECONNABORTED,
              config,
            );
          throw error;
        }
        assertWorkspace(workspace);
        let data: unknown = text;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          /* Preserve text error responses. */
        }
        const result = {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          config,
        };
        if (!response.ok)
          throw new AxiosError(
            `Request failed with status code ${response.status}`,
            undefined,
            config,
            undefined,
            result,
          );
        return result;
      },
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
      timeout: REQUEST_TIMEOUT_MS,
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
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    config.signal = this.abortController.signal;

    return config;
  };

  private handleError = (error: AxiosError) => {
    if (!(error instanceof AxiosError)) throw error;
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

    const data = response.data;
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? data.message
        : undefined;
    throw new Error(
      Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'string'
          ? message
          : error.message,
    );
  };

  public setToken(newToken: string) {
    this.token = newToken;
  }
}
