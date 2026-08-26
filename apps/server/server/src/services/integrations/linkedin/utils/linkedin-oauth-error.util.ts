import { HttpException, HttpStatus } from '@nestjs/common';

const CONFIG_OAUTH_CODES = new Set(['invalid_client']);

const CONFIG_MESSAGE_PATTERNS = [
  'the client id must be specified',
  'the oauth 2.0 redirect url must be specified',
];

const PROVIDER_CLIENT_OAUTH_CODES = new Set([
  'access_denied',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
  'unsupported_grant_type',
]);

const PROVIDER_CLIENT_MESSAGE_PATTERNS = [
  'access_denied',
  'authorization code already used',
  'authorization code expired',
  'invalid authorization code',
  'invalid_grant',
  'invalid_request',
];

const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

export type LinkedInOAuthErrorKind =
  | 'config'
  | 'provider_client'
  | 'provider_unavailable'
  | 'unknown';

export type LinkedInOAuthErrorClassification = {
  detail: string;
  kind: LinkedInOAuthErrorKind;
  status: number;
  title: string;
};

export type LinkedInOAuthErrorLog = {
  code?: string;
  kind: LinkedInOAuthErrorKind;
  name?: string;
  status?: number;
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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

function readLinkedInOAuthHttpStatus(error: unknown): number | undefined {
  if (error instanceof HttpException) {
    return error.getStatus();
  }

  if (!isRecord(error)) {
    return undefined;
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const metadata = isRecord(error.metadata) ? error.metadata : undefined;

  return (
    readFiniteNumber(response?.status) ??
    readFiniteNumber(error.status) ??
    readFiniteNumber(metadata?.status)
  );
}

function readLinkedInOAuthErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const data = isRecord(response?.data) ? response.data : undefined;
  const nestedError = data?.error;

  if (typeof nestedError === 'string') {
    return nestedError;
  }

  if (isRecord(nestedError)) {
    return readString(nestedError.code) ?? readString(nestedError.error);
  }

  return readString(error.code);
}

function isNetworkFailure(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = readString(error.code);
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  return Boolean(error.request) && !error.response;
}

export function classifyLinkedInOAuthError(
  error: unknown,
): LinkedInOAuthErrorClassification {
  const status = readLinkedInOAuthHttpStatus(error);
  const code = readLinkedInOAuthErrorCode(error)?.toLowerCase();
  const message = readErrorMessage(error).toLowerCase();

  if (
    (code && CONFIG_OAUTH_CODES.has(code)) ||
    CONFIG_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))
  ) {
    return {
      detail:
        'The linkedin integration is missing its provider credentials on this server.',
      kind: 'config',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      title: 'Integration not configured',
    };
  }

  if (
    (code && PROVIDER_CLIENT_OAUTH_CODES.has(code)) ||
    PROVIDER_CLIENT_MESSAGE_PATTERNS.some((pattern) =>
      message.includes(pattern),
    )
  ) {
    return {
      detail:
        'LinkedIn rejected the authorization. Please try connecting again.',
      kind: 'provider_client',
      status: HttpStatus.BAD_REQUEST,
      title: 'LinkedIn authorization failed',
    };
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return {
      detail: 'LinkedIn rejected the authorization request.',
      kind: 'provider_client',
      status,
      title: 'LinkedIn authorization failed',
    };
  }

  if ((status !== undefined && status >= 500) || isNetworkFailure(error)) {
    return {
      detail: 'LinkedIn is temporarily unavailable. Please try again later.',
      kind: 'provider_unavailable',
      status: HttpStatus.BAD_GATEWAY,
      title: 'LinkedIn provider error',
    };
  }

  return {
    detail: 'An internal server error occurred',
    kind: 'unknown',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: 'Internal Server Error',
  };
}

export function getSafeLinkedInOAuthErrorLog(
  error: unknown,
): LinkedInOAuthErrorLog {
  const classification = classifyLinkedInOAuthError(error);
  const status = readLinkedInOAuthHttpStatus(error);
  const code = readLinkedInOAuthErrorCode(error);
  const name = error instanceof Error ? error.name : undefined;

  return {
    ...(code ? { code } : {}),
    kind: classification.kind,
    ...(name ? { name } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

export function throwMappedLinkedInOAuthError(
  error: unknown,
  fallbackDetail: string,
): never {
  if (error instanceof HttpException) {
    throw error;
  }

  const classification = classifyLinkedInOAuthError(error);

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
