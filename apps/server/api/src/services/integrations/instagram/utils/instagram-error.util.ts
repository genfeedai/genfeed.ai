import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { AxiosError } from 'axios';

interface InstagramGraphErrorBody {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
}

interface InstagramErrorPayload {
  error?: InstagramGraphErrorBody | string;
  error_code?: number | string;
  error_description?: string;
}

const AUTHORIZATION_CODES = new Set([190, 102]);
const CONFIGURATION_CODES = new Set([101]);
const REDIRECT_MISMATCH_CODES = new Set([100, 191]);
const SCOPE_CODES = new Set([10, 200, 294]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const AUTHORIZATION_ERROR_CODES = new Set(['access_denied', 'invalid_grant']);
const CONFIGURATION_ERROR_CODES = new Set(['invalid_client']);
const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
]);
const REDIRECT_MISMATCH_PATTERN =
  /redirect[_\s-]?(?:uri|url)|callback[_\s-]?url/i;
const PROFESSIONAL_ACCOUNT_PATTERN =
  /professional account|instagram professional|business account required|creator account|a professional instagram/i;

export type InstagramOAuthErrorKind =
  | 'authorization'
  | 'configuration'
  | 'http_exception'
  | 'provider_failure'
  | 'provider_unavailable'
  | 'redirect_mismatch'
  | 'unknown';

export type InstagramOAuthErrorClassification = {
  detail: string;
  kind: InstagramOAuthErrorKind;
  status: number;
  title: string;
};

export type InstagramOAuthErrorLog = {
  category: InstagramOAuthErrorKind;
  httpStatus?: number;
  providerCode?: number | string;
  providerSubcode?: number;
  transportCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readInstagramResponse(error: unknown):
  | {
      data?: unknown;
      status?: number;
    }
  | undefined {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }

  return {
    data: error.response.data,
    status: readFiniteNumber(error.response.status),
  };
}

function readInstagramErrorRecord(
  error: unknown,
): Record<string, unknown> | undefined {
  let current = readInstagramResponse(error)?.data;

  for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
    if (isRecord(current.error)) {
      current = current.error;
      continue;
    }

    if (
      readFiniteNumber(current.code) !== undefined ||
      readString(current.message) !== undefined ||
      readString(current.type) !== undefined
    ) {
      return current;
    }

    return undefined;
  }

  return undefined;
}

function readInstagramProviderStringCode(error: unknown): string | undefined {
  const data = readInstagramResponse(error)?.data;
  if (!isRecord(data)) {
    return undefined;
  }

  const directError = readString(data.error);
  const errorCode = readString(data.error_code);
  const code = directError ?? errorCode;

  return code && /^[a-z][a-z0-9_.-]{0,63}$/i.test(code) ? code : undefined;
}

function readInstagramProviderNumericCode(error: unknown): number | undefined {
  const data = readInstagramResponse(error)?.data;
  return isRecord(data) ? readFiniteNumber(data.error_code) : undefined;
}

function readInstagramProviderMessage(error: unknown): string {
  const graphMessage = readString(readInstagramErrorRecord(error)?.message);
  if (graphMessage) {
    return graphMessage;
  }

  const data = readInstagramResponse(error)?.data;
  return isRecord(data) ? (readString(data.error_description) ?? '') : '';
}

function readInstagramHttpStatus(error: unknown): number | undefined {
  if (error instanceof HttpException) {
    return error.getStatus();
  }

  if (!isRecord(error)) {
    return undefined;
  }

  return readInstagramResponse(error)?.status ?? readFiniteNumber(error.status);
}

function readInstagramTransportCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const code = readString(error.code);
  return code && NETWORK_ERROR_CODES.has(code) ? code : undefined;
}

function isInstagramNetworkFailure(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  return (
    Boolean(readInstagramTransportCode(error)) ||
    (Boolean(error.request) && !error.response)
  );
}

export function parseInstagramGrantedScopes(value: unknown): string[] {
  return parseGrantedOAuthScopes(value);
}

export function getInstagramGraphError(
  error: unknown,
): InstagramGraphErrorBody | undefined {
  const graphError = readInstagramErrorRecord(error);
  const code =
    readFiniteNumber(graphError?.code) ??
    readInstagramProviderNumericCode(error);
  const errorSubcode = readFiniteNumber(graphError?.error_subcode);
  const message = readString(graphError?.message);
  const type = readString(graphError?.type);

  if (
    code === undefined &&
    errorSubcode === undefined &&
    message === undefined &&
    type === undefined
  ) {
    return undefined;
  }

  return {
    ...(code !== undefined ? { code } : {}),
    ...(errorSubcode !== undefined ? { error_subcode: errorSubcode } : {}),
    ...(message ? { message } : {}),
    ...(type ? { type } : {}),
  };
}

export function getInstagramErrorCode(error: unknown): number | undefined {
  const code = getInstagramGraphError(error)?.code;
  return typeof code === 'number' && Number.isFinite(code) ? code : undefined;
}

export function isInstagramAuthorizationError(error: unknown): boolean {
  const code = getInstagramErrorCode(error);
  return code !== undefined && AUTHORIZATION_CODES.has(code);
}

export function isInstagramScopeError(error: unknown): boolean {
  if (isInstagramProfessionalAccountError(error)) {
    return false;
  }

  const code = getInstagramErrorCode(error);
  if (code !== undefined && SCOPE_CODES.has(code)) {
    return true;
  }

  const message = getInstagramGraphError(error)?.message?.toLowerCase() ?? '';
  return message.includes('permission') || message.includes('(#10)');
}

export function isInstagramProfessionalAccountError(error: unknown): boolean {
  const message = getInstagramGraphError(error)?.message ?? '';
  return PROFESSIONAL_ACCOUNT_PATTERN.test(message);
}

export function isInstagramRateLimitError(error: unknown): boolean {
  const axiosError = error as
    | AxiosError<InstagramErrorPayload>
    | null
    | undefined;
  const code = getInstagramErrorCode(error);
  return (
    axiosError?.response?.status === 429 ||
    (code !== undefined && RATE_LIMIT_CODES.has(code))
  );
}

export function classifyInstagramOAuthError(
  error: unknown,
): InstagramOAuthErrorClassification {
  if (error instanceof HttpException) {
    return {
      detail: 'Instagram OAuth request failed.',
      kind: 'http_exception',
      status: error.getStatus(),
      title: 'Instagram OAuth error',
    };
  }

  const graphError = getInstagramGraphError(error);
  const providerCode = graphError?.code;
  const providerStringCode =
    readInstagramProviderStringCode(error)?.toLowerCase();
  const providerMessage = readInstagramProviderMessage(error);
  const httpStatus = readInstagramHttpStatus(error);

  if (
    (providerCode !== undefined && REDIRECT_MISMATCH_CODES.has(providerCode)) ||
    REDIRECT_MISMATCH_PATTERN.test(providerMessage)
  ) {
    return {
      detail:
        'Instagram rejected the authorization because the redirect URI did not match. Please reconnect your Instagram account. If the problem continues, contact support.',
      kind: 'redirect_mismatch',
      status: HttpStatus.BAD_REQUEST,
      title: 'Configuration error',
    };
  }

  if (
    (providerCode !== undefined && AUTHORIZATION_CODES.has(providerCode)) ||
    (providerStringCode !== undefined &&
      AUTHORIZATION_ERROR_CODES.has(providerStringCode))
  ) {
    return {
      detail:
        'Instagram rejected the authorization code. It may have expired, already been used, or be invalid. Please reconnect your Instagram account.',
      kind: 'authorization',
      status: HttpStatus.BAD_REQUEST,
      title: 'Authentication failed',
    };
  }

  if (
    (providerCode !== undefined && CONFIGURATION_CODES.has(providerCode)) ||
    (providerStringCode !== undefined &&
      CONFIGURATION_ERROR_CODES.has(providerStringCode))
  ) {
    return {
      detail: 'Instagram OAuth is not configured correctly on this server.',
      kind: 'configuration',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      title: 'Integration not configured',
    };
  }

  if (
    (httpStatus !== undefined && httpStatus >= 500) ||
    isInstagramNetworkFailure(error)
  ) {
    return {
      detail:
        'Instagram could not complete the token exchange. Please try again later.',
      kind: 'provider_unavailable',
      status: HttpStatus.BAD_GATEWAY,
      title: 'Instagram provider error',
    };
  }

  if (readInstagramResponse(error)) {
    return {
      detail:
        'Instagram could not complete the token exchange. Please try again later.',
      kind: 'provider_failure',
      status: HttpStatus.BAD_GATEWAY,
      title: 'Instagram provider error',
    };
  }

  return {
    detail: 'An internal server error occurred',
    kind: 'unknown',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: 'Internal Server Error',
  };
}

export function getSafeInstagramOAuthErrorLog(
  error: unknown,
): InstagramOAuthErrorLog {
  const classification = classifyInstagramOAuthError(error);
  const graphError = getInstagramGraphError(error);
  const providerStringCode = readInstagramProviderStringCode(error);
  const httpStatus = readInstagramHttpStatus(error);
  const transportCode = readInstagramTransportCode(error);

  return {
    category: classification.kind,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(graphError?.code !== undefined
      ? { providerCode: graphError.code }
      : providerStringCode
        ? { providerCode: providerStringCode }
        : {}),
    ...(graphError?.error_subcode !== undefined
      ? { providerSubcode: graphError.error_subcode }
      : {}),
    ...(transportCode ? { transportCode } : {}),
  };
}

export function throwMappedInstagramOAuthError(
  error: unknown,
  fallbackDetail: string,
): never {
  if (error instanceof HttpException) {
    throw error;
  }

  const classification = classifyInstagramOAuthError(error);

  if (
    classification.kind === 'authorization' ||
    classification.kind === 'redirect_mismatch'
  ) {
    throw new HttpException(
      {
        detail: classification.detail,
        title: classification.title,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (classification.kind === 'unknown') {
    throw new HttpException(
      {
        detail: fallbackDetail,
        title: 'Internal Server Error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  throw new HttpException(
    {
      detail: classification.detail,
      title: classification.title,
    },
    classification.status,
  );
}

export function getInstagramRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as
    | AxiosError<InstagramErrorPayload>
    | null
    | undefined;
  const retryAfter = axiosError?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}
