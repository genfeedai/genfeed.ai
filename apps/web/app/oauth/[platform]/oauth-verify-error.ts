import {
  InstagramOAuthVerifyErrorCode,
  YoutubeOAuthVerifyErrorCode,
} from '@genfeedai/contracts';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { getErrorStatus } from '@utils/error/json-api-status.util';

const GENERIC_VERIFY_FAILURE = {
  messageKey: 'error.description',
  titleKey: 'error.title',
} as const;

// The server words Google Business refusals for the customer (no locations,
// scope not granted, Business Profile access not approved), so they are shown
// as written instead of mapped to a catalog of codes.
const GOOGLE_BUSINESS_PLATFORM = 'google-business';
const GOOGLE_BUSINESS_NOT_READY_STATUS = 503;
const GOOGLE_BUSINESS_EXPLAINED_STATUSES = [400, 502, 503];

const YOUTUBE_VERIFY_COPY: Record<
  string,
  { messageKey: string; titleKey: string }
> = {
  [YoutubeOAuthVerifyErrorCode.ACCESS_DENIED]: {
    messageKey: 'error.denied',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.AUTHORIZATION_FAILED]: {
    messageKey: 'error.youtubeAuthorizationFailed',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.CHANNEL_MISSING]: {
    messageKey: 'error.youtubeChannelMissing',
    titleKey: 'error.youtubeChannelMissingTitle',
  },
  [YoutubeOAuthVerifyErrorCode.MISSING_SCOPES]: {
    messageKey: 'error.youtubeMissingScopes',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.PROVIDER_FAILURE]: {
    messageKey: 'error.youtubeProviderFailure',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.STATE_INVALID]: {
    messageKey: 'error.youtubeStateInvalid',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED]: {
    messageKey: 'error.youtubeTokenExchange',
    titleKey: 'error.title',
  },
  [YoutubeOAuthVerifyErrorCode.UNKNOWN]: GENERIC_VERIFY_FAILURE,
};

export function resolveOAuthPlatformVerifyFailure(input: {
  callbackSubmitted: boolean;
  error: unknown;
  platform: string;
  providerError: string | null;
}): {
  canRestart: boolean;
  canRetry: boolean;
  /** Server wording shown instead of the {@link messageKey} copy. */
  detail?: string;
  messageKey: string;
  titleKey: string;
} {
  const canRetry = !input.callbackSubmitted;
  const googleBusinessMember =
    input.platform === GOOGLE_BUSINESS_PLATFORM && !input.providerError
      ? getJsonApiErrorMember(input.error)
      : null;
  const googleBusinessDetail =
    googleBusinessMember?.detail &&
    googleBusinessMember.status !== undefined &&
    GOOGLE_BUSINESS_EXPLAINED_STATUSES.includes(googleBusinessMember.status)
      ? googleBusinessMember.detail
      : undefined;
  const isGoogleBusinessNotReady =
    googleBusinessMember?.status === GOOGLE_BUSINESS_NOT_READY_STATUS;
  const canRestart =
    input.callbackSubmitted &&
    (input.platform === 'instagram' ||
      input.platform === 'youtube' ||
      (input.platform === GOOGLE_BUSINESS_PLATFORM &&
        !isGoogleBusinessNotReady));

  if (googleBusinessDetail) {
    return {
      canRestart,
      canRetry,
      detail: googleBusinessDetail,
      messageKey: GENERIC_VERIFY_FAILURE.messageKey,
      titleKey: isGoogleBusinessNotReady
        ? 'error.googleBusinessNotReadyTitle'
        : GENERIC_VERIFY_FAILURE.titleKey,
    };
  }

  if (input.providerError) {
    const denied =
      input.providerError === 'access_denied' ||
      input.providerError === 'user_denied';
    return {
      canRestart,
      canRetry,
      messageKey: denied ? 'error.denied' : 'error.failed',
      titleKey: 'error.title',
    };
  }

  if (
    input.platform === 'instagram' &&
    getJsonApiErrorMember(input.error)?.code ===
      InstagramOAuthVerifyErrorCode.MISSING_SCOPES
  ) {
    return {
      canRestart,
      canRetry,
      messageKey: 'error.instagramMissingScopes',
      titleKey: 'error.instagramMissingScopesTitle',
    };
  }

  if (input.platform === 'youtube') {
    const code = getJsonApiErrorMember(input.error)?.code;
    const mapped = code ? YOUTUBE_VERIFY_COPY[code] : undefined;
    if (mapped) {
      return {
        canRestart,
        canRetry,
        messageKey: mapped.messageKey,
        titleKey: mapped.titleKey,
      };
    }
  }

  return {
    canRestart,
    canRetry,
    messageKey: GENERIC_VERIFY_FAILURE.messageKey,
    titleKey: GENERIC_VERIFY_FAILURE.titleKey,
  };
}

export function isReportableOAuthVerifyFailure(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === undefined || status >= 429;
}

export function isHttpsAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
