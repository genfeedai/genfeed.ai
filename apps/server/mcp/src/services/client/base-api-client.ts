import { createHash } from 'node:crypto';
import { MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@mcp/config/config.service';
import { resolveApiBaseUrl } from '@mcp/shared/utils/api-url.util';
import type { HttpService } from '@nestjs/axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import type { ApiError } from './client.types';

/**
 * Low-level HTTP foundation shared by every domain client.
 *
 * Owns the single axios instance — so {@link setBearerToken} propagates to all
 * sub-clients that compose this base — plus the canonical request/error shell
 * and the JSON:API response-unwrap helpers. Domain clients receive one instance
 * of this class and route every call through {@link request}, which replaces the
 * ~52 copies of try/catch/logError/throw that previously lived inline.
 */
export class BaseApiClient {
  private readonly http: AxiosInstance;
  private bearerToken: string;

  constructor(
    readonly logger: LoggerService,
    httpService: HttpService,
    configService: ConfigService,
  ) {
    this.bearerToken = (configService.get('GENFEEDAI_API_KEY') as string) || '';
    const baseURL = resolveApiBaseUrl(
      configService.get('GENFEEDAI_API_URL') as string | undefined,
    );

    this.http = httpService.axiosRef.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
        ...(this.bearerToken
          ? {
              [MCP_ACTION_ORIGIN_PROOF_HEADER]: this.createActionOriginProof(
                this.bearerToken,
              ),
            }
          : {}),
      },
      timeout: 30000,
    });
  }

  setBearerToken(token: string): void {
    this.bearerToken = token;
    if (token) {
      this.http.defaults.headers.Authorization = `Bearer ${token}`;
      this.http.defaults.headers[MCP_ACTION_ORIGIN_PROOF_HEADER] =
        this.createActionOriginProof(token);
    } else {
      delete this.http.defaults.headers.Authorization;
      delete this.http.defaults.headers[MCP_ACTION_ORIGIN_PROOF_HEADER];
    }
  }

  private createActionOriginProof(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  /**
   * Canonical request shell. Runs `call` against the shared axios instance and,
   * on failure, logs once via {@link logError} then hands the error to
   * `onError` — which either throws (see {@link failWith} / {@link failWithDetail})
   * or returns a fallback value (e.g. an empty-analytics object).
   */
  async request<T>(
    operation: string,
    call: (http: AxiosInstance) => Promise<T>,
    onError: (error: ApiError) => T,
  ): Promise<T> {
    try {
      return await call(this.http);
    } catch (error: unknown) {
      this.logError(operation, error as ApiError);
      return onError(error as ApiError);
    }
  }

  /** `onError` factory: throw a fixed message (the bare-throw methods). */
  failWith(message: string): (error: ApiError) => never {
    return () => {
      throw new Error(message);
    };
  }

  /** `onError` factory: prefer the API-supplied error detail, else `defaultMessage`. */
  failWithDetail(defaultMessage: string): (error: ApiError) => never {
    return (error: ApiError) => {
      throw new Error(this.getErrorMessage(error, defaultMessage));
    };
  }

  getErrorMessage(error: ApiError, defaultMessage: string): string {
    return error.response?.data?.errors?.[0]?.detail || defaultMessage;
  }

  logError(operation: string, error: ApiError): void {
    this.logger.error(`Error ${operation}`, error.message, {
      data: error.response?.data,
    });
  }

  // ── Response unwrap helpers (JSON:API `{ data: { ... } }` envelope) ──

  /** `data.data` → `data` → `[]`. */
  unwrapList<T = unknown>(response: AxiosResponse): T[] {
    return (response.data?.data || response.data || []) as T[];
  }

  /** `data.data` → `data` (no fallback). */
  unwrapData<T = unknown>(response: AxiosResponse): T {
    return (response.data?.data || response.data) as T;
  }

  /** `data.data` → `data` → `{}`. */
  unwrapObject<T = Record<string, unknown>>(response: AxiosResponse): T {
    return (response.data?.data || response.data || {}) as T;
  }

  /** `data.data.attributes` → `data.data` → `{}`. */
  unwrapAttributes<T = Record<string, unknown>>(response: AxiosResponse): T {
    return (response.data?.data?.attributes || response.data?.data || {}) as T;
  }

  /**
   * Generic attribute POST proxy: posts `payload` and returns the created
   * resource's attributes. Intentionally unguarded — raw axios errors
   * propagate to the caller, matching prior behavior. Note the nullish (`??`)
   * unwrap here is deliberately distinct from {@link unwrapAttributes}'s `||`
   * form: callers expect `null`/empty attributes to pass through untouched.
   */
  async postAttributes<TResponse>(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<TResponse> {
    const response = await this.http.post(endpoint, payload);
    return (response.data?.data?.attributes ??
      response.data?.data) as TResponse;
  }
}
