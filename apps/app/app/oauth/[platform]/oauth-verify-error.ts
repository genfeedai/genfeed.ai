import { YoutubeOAuthVerifyErrorCode } from '@genfeedai/contracts';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';

const GENERIC_VERIFY_FAILURE = {
  messageKey: 'error.description',
  titleKey: 'error.title',
} as const;

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
  messageKey: string;
  titleKey: string;
} {
  const canRetry = !input.callbackSubmitted;
  const canRestart = input.platform === 'youtube' && input.callbackSubmitted;

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
