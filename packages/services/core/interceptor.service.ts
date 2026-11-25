import { ModalEnum } from '@genfeedai/contracts';
import { X_POSTING_INSUFFICIENT_CREDITS_CODE } from '@genfeedai/contracts/api-types/contracts/x-posting-billing.contract';
import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
  WORKFLOW_MISSING_INPUT_CODE,
} from '@genfeedai/contracts/constants';
import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import type {
  IHttpCancelledError,
  IHttpInterceptorError,
  IHttpSanitizedError,
} from '@genfeedai/contracts/interfaces/utils/http-interceptor-error.interface';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { setErrorDebugInfo } from '@services/core/error-debug-store';
import { getGenerationEntryHeaders } from '@services/core/generation-entry-headers';
import {
  getJsonApiErrorMember,
  getPersistedVideoIngredientIds,
} from '@services/core/json-api-error-message';
import {
  createOrganizationNotConfirmedError,
  RequestOrganizationGate,
} from '@services/core/request-organization-gate';
import {
  buildInstanceKey,
  ServiceInstanceManager,
} from '@services/core/service-instance-manager';
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
 * Ceiling on a single API request before it is aborted as a timeout.
 *
 * Thirty seconds, not ten: the slowest reads behind this client are
 * collection endpoints that page through generated media, and a ten-second
 * ceiling turns those into spurious timeout modals for the operator. Calls
 * that legitimately run longer — asset uploads are the only ones today — pass
 * a per-request `timeout` and are not bound by this default.
 */
export const HTTP_REQUEST_TIMEOUT_MS = 30_000;

/** `InsufficientCreditsException` code: the API refused a credit-spending action. */
const INSUFFICIENT_CREDITS_ERROR_CODE = 'INSUFFICIENT_CREDITS';

const httpServiceInstances = new ServiceInstanceManager<HTTPBaseService>();

/**
 * The organization every API request of this tab acts for. The axios
 * interceptor, the direct `fetch` clients and the socket all read it; a
 * request made while it is provisional is held (see `RequestOrganizationGate`).
 */
export const requestOrganizationGate = new RequestOrganizationGate();

export function setRequestOrganizationId(organizationId: string | null): void {
  const nextOrganizationId = organizationId?.trim() || null;
  if (nextOrganizationId) {
    requestOrganizationGate.setConfirmed(nextOrganizationId);
  } else {
    requestOrganizationGate.setUnscoped();
  }
}

/**
 * The page was drawn from this device's last confirmed copy for this
 * organization and user: requests are held until the membership check names
 * the organization, and are sent only if it is this one.
 */
export function setProvisionalRequestOrganization(
  organizationId: string,
  userId: string,
): void {
  requestOrganizationGate.setProvisional(organizationId, userId);
}

export function clearRequestOrganizationId(): void {
  setRequestOrganizationId(null);
}

/**
 * `ORGANIZATION_CONTEXT_HEADER` for a caller that cannot wait, set exactly
 * when the axios interceptor would send it, so the API can fail closed on
 * organization drift. Empty while no routed organization is confirmed. Throws
 * while the organization is provisional, so a caller that was missed fails
 * closed instead of sending a request that the API would answer for another
 * organization. A client that sends the request itself awaits
 * {@link whenRequestOrganizationSettled} instead.
 */
export function getRequestOrganizationHeaders(): Record<string, string> {
  return requestOrganizationGate.getHeaders();
}

/**
 * The confirmed organization, or null while none is (not routed, or still
 * provisional). Never throws, so a render can compare it; a request builds its
 * headers from {@link whenRequestOrganizationSettled}.
 */
export function getConfirmedRequestOrganizationId(): string | null {
  return requestOrganizationGate.getConfirmedOrganizationId();
}

/**
 * The headers a direct API request must carry, once it may leave: at once
 * while the organization is confirmed or not routed, after the membership
 * check answers while it is provisional. Rejects as cancelled when the check
 * does not confirm the provisional organization, so such a request is never
 * sent.
 */
export function whenRequestOrganizationSettled(): Promise<
  Record<string, string>
> {
  return requestOrganizationGate.whenSettledHeaders();
}

/**
 * Clear all cached HTTP service instances
 * Call this on logout/sign-out to prevent stale token usage
 */
export function clearAllServiceInstances(): void {
  httpServiceInstances.clearAll();
}

/**
 * Abort requests created under the previous tenant before dropping their
 * service instances. Route reconciliation uses this before exposing a new
 * organization context.
 */
export function cancelAndClearAllServiceInstances(): void {
  httpServiceInstances.forEach((service) => {
    service.cancelPendingRequests();
  });
  httpServiceInstances.clearAll();
}

function rejectWhenAborted<T>(
  pending: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createOrganizationNotConfirmedError());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(createOrganizationNotConfirmedError());
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

export abstract class HTTPBaseService {
  protected instance: AxiosInstance;
  protected token: string;
  protected readonly baseURL: string;
  private boundOrganizationId: string | undefined;
  private boundOrganizationRevision: number | undefined;
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
      timeout: HTTP_REQUEST_TIMEOUT_MS,
    });

    this.token = token;

    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();
  }

  static getInstance(token: string): HTTPBaseService {
    // biome-ignore lint/complexity: static factory must preserve the subclass constructor for singleton caching.
    const serviceConstructor = this as unknown as new (
      token: string,
    ) => HTTPBaseService;

    // Check if we have a cached instance for this service + token
    const cached = httpServiceInstances.get<HTTPBaseService>(
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
    httpServiceInstances.set(serviceConstructor, token, instance);

    return instance;
  }

  static getBaseServiceInstance<
    T extends HTTPBaseService,
    TArgs extends unknown[],
  >(serviceConstructor: new (...args: TArgs) => T, ...args: TArgs): T {
    const instanceKey = buildInstanceKey(args);

    const cached = httpServiceInstances.get<T>(serviceConstructor, instanceKey);
    if (
      cached &&
      Object.getPrototypeOf(cached) === serviceConstructor.prototype
    ) {
      return cached;
    }

    const instance = new serviceConstructor(...args);
    httpServiceInstances.set(serviceConstructor, instanceKey, instance);

    return instance;
  }

  /**
   * Clear singleton instance for specific token
   */
  static clearInstance(...args: unknown[]): void {
    const [firstArg, secondArg] = args;
    const hasConstructor = typeof firstArg === 'function';
    const serviceConstructor =
      // biome-ignore lint/complexity/noThisInStatic: `this` is the subclass constructor the caller invoked clearInstance on
      (hasConstructor ? firstArg : this) as abstract new (
        ...ctorArgs: unknown[]
      ) => HTTPBaseService;
    const token = hasConstructor
      ? (secondArg as string | undefined)
      : (firstArg as string | undefined);

    if (!token) {
      httpServiceInstances.clear(serviceConstructor);
      return;
    }

    httpServiceInstances.clearByToken(serviceConstructor, token);
  }

  /**
   * Clear all singleton instances (useful for testing)
   */
  static clearAllInstances(): void {
    httpServiceInstances.clearAll();
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

  protected bindRequestOrganization(organizationId: string): void {
    if (this.boundOrganizationId !== undefined) {
      throw new Error('Request organization is already bound');
    }
    this.boundOrganizationId = organizationId.trim();
    this.boundOrganizationRevision = requestOrganizationGate.getRevision();
  }

  private initializeRequestInterceptor = () => {
    this.instance.interceptors.request.use(this.handleRequest);
  };

  private initializeResponseInterceptor = () => {
    this.instance.interceptors.response.use((res) => res, this.handleError);
  };

  /**
   * Organization header for a subclass's raw `fetch` (one that must stay off
   * the interceptor), under the interceptor's binding rule: it waits while
   * the organization is provisional, and a bound service whose organization
   * is not the confirmed one throws `CanceledError` instead of sending the
   * request. A binding that passes the check equals the routed organization,
   * so the header is the routed one.
   */
  protected async requestOrganizationHeaders(): Promise<
    Record<string, string>
  > {
    // The headers of the moment the check settled: scope cleared between the
    // release and this continuation must not send the request without them.
    const headers = await requestOrganizationGate.whenSettledHeaders();
    return this.confirmedOrganizationHeaders(headers);
  }

  /**
   * A service whose every request must leave without waiting for the
   * organization to be confirmed (the public API, which has no organization).
   */
  protected isOrganizationGateExempt(): boolean {
    return false;
  }

  private confirmedOrganizationHeaders(
    settledHeaders?: Record<string, string>,
  ): Record<string, string> {
    if (
      this.boundOrganizationId !== undefined &&
      (!this.boundOrganizationId ||
        this.boundOrganizationId !==
          requestOrganizationGate.getConfirmedOrganizationId() ||
        this.boundOrganizationRevision !==
          requestOrganizationGate.getRevision())
    ) {
      throw createOrganizationNotConfirmedError();
    }
    return settledHeaders ?? requestOrganizationGate.getHeaders();
  }

  private handleRequest = (
    config: InternalAxiosRequestConfig & IHttpRequestOptions,
  ): InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig> => {
    if (
      config.exemptFromOrganizationGate === true ||
      this.isOrganizationGateExempt()
    ) {
      return this.prepareRequest(
        config,
        requestOrganizationGate.isProvisional()
          ? {}
          : this.confirmedOrganizationHeaders(),
      );
    }

    if (requestOrganizationGate.isProvisional()) {
      // A held request is still cancellable: cancelPendingRequests() and the
      // caller's own signal end the wait, and the request is never sent.
      return rejectWhenAborted(
        this.requestOrganizationHeaders(),
        this.requestSignal(config),
      ).then((headers) => this.prepareRequest(config, headers));
    }

    return this.prepareRequest(config, this.confirmedOrganizationHeaders());
  };

  /**
   * Compose the instance-level cancellation signal with any per-request
   * signal (e.g. from findOne/findAll callers) so that either side can abort
   * the request independently. Overwriting config.signal unconditionally
   * would silently discard the caller's signal. The instance-level controller
   * exists for manual cancellation via cancelPendingRequests().
   * Axios types config.signal as GenericAbortSignal (a structural subset of
   * AbortSignal); at runtime callers always pass a native AbortSignal, so the
   * cast to AbortSignal is safe.
   */
  private requestSignal(config: InternalAxiosRequestConfig): AbortSignal {
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    return config.signal
      ? AbortSignal.any([
          this.abortController.signal,
          config.signal as AbortSignal,
        ])
      : this.abortController.signal;
  }

  private prepareRequest(
    config: InternalAxiosRequestConfig,
    organizationHeaders: Record<string, string>,
  ): InternalAxiosRequestConfig {
    config.headers.Authorization = `Bearer ${this.token}`;
    for (const [name, value] of Object.entries({
      ...getGenerationEntryHeaders(),
      ...organizationHeaders,
    })) {
      config.headers[name] = value;
    }
    // Server-side calls (SSR, route handlers) reach the API from this server's
    // address, often loopback on self-host. Declare the visitor unknown so the
    // API never grants admin power from that address.
    if (typeof window === 'undefined') {
      config.headers[UNATTRIBUTED_FORWARDED_HEADER] =
        UNATTRIBUTED_FORWARDED_VALUE;
    }

    // Don't auto-cancel previous requests - let them complete naturally
    // Only cancel if explicitly called via cancelPendingRequests()
    // This prevents race conditions when multiple components load simultaneously

    config.signal = this.requestSignal(config);

    return config;
  }

  handleError = async (error: AxiosError) => {
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
      // Expected client outcomes (missing resource, auth, validation) should
      // not interrupt the page with the Error Debug beta modal — surfaces own
      // empty/not-found UI. Keep modal for 5xx and unexpected 4xx (e.g. 409).
      const status = response?.status;
      const isExpectedClientStatus =
        status === 401 || status === 403 || status === 404 || status === 422;
      const requestOptions = request as
        | (InternalAxiosRequestConfig & IHttpRequestOptions)
        | undefined;
      const isSurfaceHandledStatus =
        typeof status === 'number' &&
        requestOptions?.handledErrorStatuses?.includes(status) === true;
      let isSurfaceHandledResponse = false;
      if (
        typeof status === 'number' &&
        Number.isFinite(status) &&
        status >= 400 &&
        typeof requestOptions?.handlesErrorResponse === 'function'
      ) {
        try {
          isSurfaceHandledResponse =
            requestOptions.handlesErrorResponse({
              status,
              data: response?.data,
            }) === true;
        } catch {
          // Presentation policy must not replace the original request rejection.
        }
      }
      const shouldShowDebugModal =
        typeof window !== 'undefined' &&
        typeof status === 'number' &&
        status >= 400 &&
        !isExpectedClientStatus &&
        !isSurfaceHandledStatus &&
        !isSurfaceHandledResponse;

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

    // Out of credits is the paywall: pages stay readable, and every refused
    // credit-spending action (generate, clips, batch, editor, agent tools)
    // answers with one prompt to buy credits or pick a plan. The caller still
    // receives the rejection below.
    // A post to X the wallet cannot pay for is the same paywall: it is refused
    // on the request with its own code.
    const refusalCode = getJsonApiErrorMember(response.data)?.code;
    if (
      typeof window !== 'undefined' &&
      (refusalCode === INSUFFICIENT_CREDITS_ERROR_CODE ||
        refusalCode === X_POSTING_INSUFFICIENT_CREDITS_CODE)
    ) {
      openModal(ModalEnum.CREDITS_REQUIRED);
    }

    // In production, sanitize error data. Throw a real Error (not a plain
    // object) so unhandled-rejection reporting gets a stack and a readable
    // title instead of a JSON-serialized object blob.
    if (EnvironmentService.isProduction && response?.data) {
      const status = response.status || 500;
      const statusText = response.statusText || 'Internal Server Error';
      const sanitizedError = new Error(
        `Request failed with status ${status} (${statusText})`,
      ) as Error & IHttpSanitizedError;
      sanitizedError.status = status;
      sanitizedError.statusText = statusText;

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
          // The missing-input list is the user's own workflow definition, and
          // the editor needs it to ask for the values, however long the
          // detail line grows with the number of inputs.
          if (firstError.code === WORKFLOW_MISSING_INPUT_CODE) {
            throw response.data;
          }
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

      const persistedVideoIngredientIds = getPersistedVideoIngredientIds(
        response.data,
      );
      if (persistedVideoIngredientIds.length)
        Object.assign(sanitizedError, { persistedVideoIngredientIds });
      throw sanitizedError;
    }

    // In development, propagate full error details
    throw response?.data || error;
  };

  public setToken(newToken: string) {
    this.token = newToken;
  }
}
