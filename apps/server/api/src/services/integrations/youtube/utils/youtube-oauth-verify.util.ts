import { randomUUID } from 'node:crypto';

import {
  getYoutubeErrorCode,
  isYoutubeAuthorizationError,
  isYoutubeChannelSelectionError,
  isYoutubeRateLimitError,
  isYoutubeScopeError,
  readSafeYoutubeProviderReason,
} from '@api/services/integrations/youtube/utils/youtube-error.util';
import { YoutubeOAuthVerifyErrorCode } from '@genfeedai/contracts';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Diagnostic reasons written to logs. They are not a client wire contract. */
export const YoutubeOAuthVerifyFailureReason = {
  ACCESS_DENIED: 'access_denied',
  AUTHORIZATION_FAILED: 'authorization_failed',
  CHANNEL_SELECTION: 'channel_selection',
  CONFIGURATION: 'configuration',
  CREDENTIAL_PERSIST: 'credential_persist',
  PERMISSIONS: 'permissions',
  PROVIDER_FAILURE: 'provider_failure',
  REQUEST_VALIDATION: 'request_validation',
  STATE_VALIDATION: 'state_validation',
  TOKEN_EXCHANGE: 'token_exchange',
  UNKNOWN: 'unknown',
} as const;

export type YoutubeOAuthVerifyFailureReason =
  (typeof YoutubeOAuthVerifyFailureReason)[keyof typeof YoutubeOAuthVerifyFailureReason];

export type YoutubeOAuthVerifyStage =
  | 'callback'
  | 'channel_lookup'
  | 'configuration'
  | 'credential_persist'
  | 'post_connection'
  | 'profile_persist'
  | 'request_received'
  | 'request_validation'
  | 'state_validation'
  | 'token_exchange';

export type YoutubeOAuthVerifyProgress = {
  stage: YoutubeOAuthVerifyStage;
};

const UUID_CORRELATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIXED_CORRELATION_ID_PATTERN =
  /^(?:corr|req|trace)[_-][A-Za-z0-9._:-]{4,64}$/i;
const PROVIDER_ERROR_CODE_PATTERN = /^[a-z0-9_]{1,64}$/i;
const CORRELATION_HEADER_NAMES = ['x-request-id', 'x-correlation-id'] as const;

const FAILURE_LOG_KEYS = [
  'correlationId',
  'httpStatus',
  'platform',
  'providerReason',
  'providerStatus',
  'reason',
  'stage',
] as const;

const CHANNEL_MISSING_DETAIL =
  'No YouTube channel was found for the selected Google account. Restart authorization and choose the YouTube channel or Brand Account.';

export class YoutubeChannelMissingError extends Error {
  constructor() {
    super('YouTube channel missing');
    this.name = 'YoutubeChannelMissingError';
  }
}

type YoutubeVerifyCopy = {
  code: YoutubeOAuthVerifyErrorCode;
  detail: string;
  reason: YoutubeOAuthVerifyFailureReason;
  status: HttpStatus;
  title: string;
};

function isKnownYoutubeVerifyCode(
  code: string,
): code is YoutubeOAuthVerifyErrorCode {
  return (Object.values(YoutubeOAuthVerifyErrorCode) as string[]).includes(
    code,
  );
}

function readResponseRecord(
  error: HttpException,
): Record<string, unknown> | undefined {
  const response: unknown = error.getResponse();
  return isObjectLike(response) ? response : undefined;
}

function reasonForCode(
  code: string | undefined,
): YoutubeOAuthVerifyFailureReason | undefined {
  switch (code) {
    case YoutubeOAuthVerifyErrorCode.ACCESS_DENIED:
      return YoutubeOAuthVerifyFailureReason.ACCESS_DENIED;
    case YoutubeOAuthVerifyErrorCode.AUTHORIZATION_FAILED:
      return YoutubeOAuthVerifyFailureReason.AUTHORIZATION_FAILED;
    case YoutubeOAuthVerifyErrorCode.CHANNEL_MISSING:
      return YoutubeOAuthVerifyFailureReason.CHANNEL_SELECTION;
    case YoutubeOAuthVerifyErrorCode.MISSING_SCOPES:
      return YoutubeOAuthVerifyFailureReason.PERMISSIONS;
    case YoutubeOAuthVerifyErrorCode.PROVIDER_FAILURE:
      return YoutubeOAuthVerifyFailureReason.PROVIDER_FAILURE;
    case YoutubeOAuthVerifyErrorCode.STATE_INVALID:
      return YoutubeOAuthVerifyFailureReason.STATE_VALIDATION;
    case YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED:
      return YoutubeOAuthVerifyFailureReason.TOKEN_EXCHANGE;
    case YoutubeOAuthVerifyErrorCode.UNKNOWN:
      return YoutubeOAuthVerifyFailureReason.UNKNOWN;
    default:
      return undefined;
  }
}

function isTransportFailure(error: unknown): boolean {
  if (!isObjectLike(error) || typeof error.code !== 'string') {
    return false;
  }

  return (
    error.code === 'EAI_AGAIN' ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ECONNRESET' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ERR_NETWORK' ||
    error.code === 'ETIMEDOUT'
  );
}

function isYoutubeProviderFailure(error: unknown): boolean {
  if (isYoutubeRateLimitError(error) || isTransportFailure(error)) {
    return true;
  }

  const status = getYoutubeErrorCode(error);
  return status !== undefined && status >= 500;
}

function copy(input: YoutubeVerifyCopy): YoutubeVerifyCopy {
  return input;
}

function channelMissingCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.CHANNEL_MISSING,
    detail: CHANNEL_MISSING_DETAIL,
    reason: YoutubeOAuthVerifyFailureReason.CHANNEL_SELECTION,
    status: HttpStatus.BAD_REQUEST,
    title: 'No YouTube channel found',
  });
}

function tokenExchangeCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED,
    detail:
      'YouTube could not exchange this authorization. Restart the connection and try again.',
    reason: YoutubeOAuthVerifyFailureReason.TOKEN_EXCHANGE,
    status: HttpStatus.BAD_GATEWAY,
    title: 'Token exchange failed',
  });
}

function missingScopesCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.MISSING_SCOPES,
    detail:
      'YouTube did not grant the permissions this connection needs. Restart authorization and accept the requested access.',
    reason: YoutubeOAuthVerifyFailureReason.PERMISSIONS,
    status: HttpStatus.FORBIDDEN,
    title: 'Missing YouTube permissions',
  });
}

function providerFailureCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.PROVIDER_FAILURE,
    detail:
      'YouTube could not verify the channel for this account. Restart the connection and try again.',
    reason: YoutubeOAuthVerifyFailureReason.PROVIDER_FAILURE,
    status: HttpStatus.BAD_GATEWAY,
    title: 'YouTube verification failed',
  });
}

function stateInvalidCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.STATE_INVALID,
    detail:
      'This YouTube connection session is no longer valid. Restart authorization to try again.',
    reason: YoutubeOAuthVerifyFailureReason.STATE_VALIDATION,
    status: HttpStatus.BAD_REQUEST,
    title: 'Connection session expired',
  });
}

function authorizationFailedCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.AUTHORIZATION_FAILED,
    detail:
      'YouTube could not finish this connection. Restart authorization and try again.',
    reason: YoutubeOAuthVerifyFailureReason.AUTHORIZATION_FAILED,
    status: HttpStatus.BAD_REQUEST,
    title: 'Authorization failed',
  });
}

function unknownCopy(): YoutubeVerifyCopy {
  return copy({
    code: YoutubeOAuthVerifyErrorCode.UNKNOWN,
    detail:
      'Failed to verify your YouTube account. Restart the connection and try again.',
    reason: YoutubeOAuthVerifyFailureReason.UNKNOWN,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: 'Connection failed',
  });
}

export function classifyYoutubeVerifyFailure(
  error: unknown,
  stage: YoutubeOAuthVerifyStage,
): YoutubeVerifyCopy {
  if (
    !isYoutubeProviderFailure(error) &&
    (error instanceof YoutubeChannelMissingError ||
      isYoutubeChannelSelectionError(error))
  ) {
    return channelMissingCopy();
  }

  if (isYoutubeScopeError(error)) {
    return missingScopesCopy();
  }

  if (stage === 'token_exchange' && !isYoutubeProviderFailure(error)) {
    return tokenExchangeCopy();
  }

  if (isYoutubeAuthorizationError(error)) {
    return authorizationFailedCopy();
  }

  if (
    stage === 'channel_lookup' ||
    stage === 'profile_persist' ||
    isYoutubeProviderFailure(error)
  ) {
    return providerFailureCopy();
  }

  if (stage === 'state_validation' || stage === 'callback') {
    return stateInvalidCopy();
  }

  return unknownCopy();
}

function toHttpException(failure: YoutubeVerifyCopy): HttpException {
  return new HttpException(
    {
      code: failure.code,
      detail: failure.detail,
      title: failure.title,
    },
    failure.status,
  );
}

function annotateCallbackException(error: HttpException): HttpException {
  const body = readResponseRecord(error);
  const title = typeof body?.title === 'string' ? body.title : undefined;
  const detail = typeof body?.detail === 'string' ? body.detail : undefined;

  if (title === 'Authorization denied' && detail) {
    return new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.ACCESS_DENIED,
        detail,
        title,
      },
      error.getStatus(),
    );
  }

  if (title === 'Authorization failed' && detail) {
    return new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.AUTHORIZATION_FAILED,
        detail,
        title,
      },
      error.getStatus(),
    );
  }

  if (title === 'Invalid payload') {
    return new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.STATE_INVALID,
        detail: detail ?? 'Missing OAuth state for the provider callback error',
        title,
      },
      error.getStatus(),
    );
  }

  return error;
}

/**
 * Maps a verification failure to a client-safe exception. Known coded
 * exceptions pass through. Raw provider errors never do.
 */
export function asYoutubeVerifyException(
  error: unknown,
  stage: YoutubeOAuthVerifyStage,
): HttpException {
  if (error instanceof HttpException) {
    const body = readResponseRecord(error);
    const code = typeof body?.code === 'string' ? body.code : undefined;
    if (code && isKnownYoutubeVerifyCode(code)) {
      return error;
    }
    if (stage === 'callback') {
      return annotateCallbackException(error);
    }
    return error;
  }

  return toHttpException(classifyYoutubeVerifyFailure(error, stage));
}

export function readYoutubeVerifyCorrelationId(
  headers: Record<string, unknown> | undefined,
): string {
  for (const name of CORRELATION_HEADER_NAMES) {
    const raw = headers?.[name];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (
      typeof candidate === 'string' &&
      (UUID_CORRELATION_ID_PATTERN.test(candidate) ||
        PREFIXED_CORRELATION_ID_PATTERN.test(candidate))
    ) {
      return candidate;
    }
  }

  return randomUUID();
}

function readProviderErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string' || !PROVIDER_ERROR_CODE_PATTERN.test(value)) {
    return undefined;
  }

  return value;
}

export function buildYoutubeVerifyRequestLog(
  dto: { code?: string; error?: string; state?: string },
  correlationId: string,
): Record<string, boolean | string> {
  const providerError = readProviderErrorCode(dto.error);

  return {
    correlationId,
    hasCode: typeof dto.code === 'string' && dto.code.length > 0,
    hasProviderError: typeof dto.error === 'string' && dto.error.length > 0,
    hasState: typeof dto.state === 'string' && dto.state.length > 0,
    platform: 'youtube',
    stage: 'request_received',
    ...(providerError ? { providerError } : {}),
  };
}

function reasonForUncoded(
  error: HttpException,
  stage: YoutubeOAuthVerifyStage,
): YoutubeOAuthVerifyFailureReason {
  const title = readResponseRecord(error)?.title;
  if (title === 'Configuration error' || stage === 'configuration') {
    return YoutubeOAuthVerifyFailureReason.CONFIGURATION;
  }
  if (stage === 'credential_persist') {
    return YoutubeOAuthVerifyFailureReason.CREDENTIAL_PERSIST;
  }
  if (stage === 'state_validation') {
    return YoutubeOAuthVerifyFailureReason.STATE_VALIDATION;
  }
  if (stage === 'request_validation' || stage === 'callback') {
    return YoutubeOAuthVerifyFailureReason.REQUEST_VALIDATION;
  }
  if (stage === 'token_exchange') {
    return YoutubeOAuthVerifyFailureReason.TOKEN_EXCHANGE;
  }
  if (stage === 'channel_lookup' || stage === 'profile_persist') {
    return YoutubeOAuthVerifyFailureReason.PROVIDER_FAILURE;
  }

  return YoutubeOAuthVerifyFailureReason.UNKNOWN;
}

export function buildYoutubeVerifyFailureLog(input: {
  correlationId: string;
  error: unknown;
  safeError: HttpException;
  stage: YoutubeOAuthVerifyStage;
}): Record<string, number | string> {
  const body = readResponseRecord(input.safeError);
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const reason =
    reasonForCode(code) ?? reasonForUncoded(input.safeError, input.stage);
  const providerSource =
    input.error instanceof HttpException ? undefined : input.error;
  const providerReason = providerSource
    ? readSafeYoutubeProviderReason(providerSource)
    : undefined;
  const providerStatus = providerSource
    ? getYoutubeErrorCode(providerSource)
    : undefined;
  const log: Record<string, number | string> = {
    correlationId: input.correlationId,
    httpStatus: input.safeError.getStatus(),
    platform: 'youtube',
    reason,
    stage: input.stage,
  };

  if (providerReason) {
    log.providerReason = providerReason;
  }
  if (providerStatus !== undefined) {
    log.providerStatus = providerStatus;
  }

  return log;
}

export function assertYoutubeVerifyFailureLogKeys(
  log: Record<string, unknown>,
): boolean {
  return Object.keys(log).every((key) =>
    (FAILURE_LOG_KEYS as readonly string[]).includes(key),
  );
}
