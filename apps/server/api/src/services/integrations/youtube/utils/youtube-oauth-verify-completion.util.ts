import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import type { CreateCredentialVerifyDto } from '@api/collections/credentials/dto/create-credential.dto';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import type { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import type { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import type { YoutubeAuthorizedSignalsService } from '@api/services/integrations/youtube/services/youtube-authorized-signals.service';
import {
  YoutubeChannelMissingError,
  type YoutubeOAuthVerifyProgress,
} from '@api/services/integrations/youtube/utils/youtube-oauth-verify.util';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import {
  CredentialPlatform,
  YoutubeOAuthVerifyErrorCode,
} from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

type YoutubeOAuthTokens = {
  access_token?: string;
  expiry_date?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type YoutubeChannelThumbnail = {
  url?: string | null;
};

type YoutubeConnectedChannelDetails = {
  customUrl?: string;
  id?: string;
  thumbnails?: {
    default?: YoutubeChannelThumbnail;
    high?: YoutubeChannelThumbnail;
    medium?: YoutubeChannelThumbnail;
  };
  title?: string;
};

export type YoutubeOAuthVerifyCompletionInput = {
  code: string | undefined;
  configService: ConfigService;
  correlationId: string;
  credentialsService: CredentialsService;
  dto: Partial<CreateCredentialVerifyDto>;
  historyImportService: SocialSourceHistoryImportService;
  loggerService: LoggerService;
  progress: YoutubeOAuthVerifyProgress;
  state: string | undefined;
  url: string;
  youtubeAuthorizedSignalsService: YoutubeAuthorizedSignalsService;
  youtubeService: YoutubeService;
};

export async function completeYoutubeOAuthVerification(
  input: YoutubeOAuthVerifyCompletionInput,
): Promise<CredentialDocument> {
  const {
    code,
    configService,
    correlationId,
    credentialsService,
    dto,
    historyImportService,
    loggerService,
    progress,
    state,
    url,
    youtubeAuthorizedSignalsService,
    youtubeService,
  } = input;

  progress.stage = 'callback';
  await throwIfOAuthCallbackError(
    credentialsService,
    dto,
    CredentialPlatform.YOUTUBE,
  );

  progress.stage = 'request_validation';
  if (!code || !state) {
    throw new HttpException(
      {
        code: state
          ? YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED
          : YoutubeOAuthVerifyErrorCode.STATE_INVALID,
        detail: 'Missing code or identifiers',
        title: 'Invalid payload',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  progress.stage = 'state_validation';
  const existingCredential =
    await credentialsService.findPendingOAuthCredential(
      state,
      CredentialPlatform.YOUTUBE,
    );

  if (!existingCredential) {
    throw new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.STATE_INVALID,
        detail: 'No pending credential found for this OAuth state',
        title: 'Credential not found',
      },
      HttpStatus.NOT_FOUND,
    );
  }

  progress.stage = 'token_exchange';
  const tokenResponse = await youtubeService.exchangeCodeForTokens(code);
  const tokens = isRecord(tokenResponse)
    ? ((tokenResponse.tokens ?? {}) as YoutubeOAuthTokens)
    : {};

  loggerService.log('Received tokens from Google', {
    accessTokenLength: tokens.access_token?.length || 0,
    correlationId,
    expiryDate: tokens.expiry_date,
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    platform: 'youtube',
    refreshTokenLength: tokens.refresh_token?.length || 0,
    scope: tokens.scope,
    stage: progress.stage,
    tokenType: tokens.token_type,
  });

  if (!tokens.access_token) {
    throw new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED,
        detail: 'YouTube did not return an access token',
        title: 'Token exchange failed',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  progress.stage = 'credential_persist';
  // If reconnecting the same channel, reactivate a previously deleted row.
  let credential = await credentialsService.patch(existingCredential.id, {
    accessToken: tokens.access_token,
    accessTokenExpiry: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : undefined,
    isConnected: true,
    isDeleted: false,
    oauthState: null,
    oauthToken: null,
    oauthTokenSecret: null,
    refreshToken: tokens.refresh_token || undefined,
    ...buildGrantedScopesCredentialPatch(tokens.scope),
  });

  const savedCredential = await credentialsService.findOne({
    id: credential.id,
  });

  if (!savedCredential?.refreshToken) {
    loggerService.error('Refresh token was not saved properly', {
      correlationId,
      credentialId: credential.id,
      hadRefreshToken: !!tokens.refresh_token,
      platform: 'youtube',
      reason: 'credential_persist',
      stage: progress.stage,
    });
    await markCredentialDisconnected(
      credentialsService,
      loggerService,
      credential.id,
    );
    throw new HttpException(
      {
        code: YoutubeOAuthVerifyErrorCode.AUTHORIZATION_FAILED,
        detail: 'Refresh token was not saved. Please try connecting again.',
        title: 'Failed to save credentials',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  credential = await updateChannelProfileAfterConnection({
    brandId: existingCredential.brandId,
    configService,
    credential,
    credentialsService,
    loggerService,
    organizationId: existingCredential.organizationId,
    progress,
    tokens,
    youtubeService,
  });

  progress.stage = 'post_connection';
  return finalizeConnection({
    accessToken: tokens.access_token,
    credential,
    credentialsService,
    grantedScopes: tokens.scope,
    historyImportService,
    loggerService,
    organizationId: existingCredential.organizationId,
    url,
    youtubeAuthorizedSignalsService,
  });
}

async function updateChannelProfileAfterConnection(params: {
  brandId: string;
  configService: ConfigService;
  credential: CredentialDocument;
  credentialsService: CredentialsService;
  loggerService: LoggerService;
  organizationId: string;
  progress: YoutubeOAuthVerifyProgress;
  tokens: YoutubeOAuthTokens;
  youtubeService: YoutubeService;
}): Promise<CredentialDocument> {
  const {
    brandId,
    configService,
    credential,
    credentialsService,
    loggerService,
    organizationId,
    progress,
    tokens,
    youtubeService,
  } = params;
  try {
    progress.stage = 'configuration';
    const clientId = configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    const redirectUri = configService.get<string>('YOUTUBE_REDIRECT_URI');
    if (
      typeof clientId !== 'string' ||
      typeof clientSecret !== 'string' ||
      typeof redirectUri !== 'string'
    ) {
      throw new HttpException(
        {
          detail: 'YouTube OAuth credentials are not configured',
          title: 'Configuration error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const oauth2Client = YoutubeOAuth2Util.createClient(
      clientId,
      clientSecret,
      redirectUri,
    );
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      refresh_token: tokens.refresh_token,
    });
    progress.stage = 'channel_lookup';
    const channelDetails = (await youtubeService.getChannelDetails(
      organizationId,
      brandId,
      oauth2Client,
    )) as YoutubeConnectedChannelDetails | null | undefined;

    if (!channelDetails?.id) {
      throw new YoutubeChannelMissingError();
    }

    progress.stage = 'profile_persist';
    return await credentialsService.updateExternalProfile(
      credential.id,
      organizationId,
      {
        avatarUrl:
          channelDetails.thumbnails?.high?.url ??
          channelDetails.thumbnails?.medium?.url ??
          channelDetails.thumbnails?.default?.url,
        // A channel's `customUrl` (its "@handle") is the only real public
        // handle YouTube exposes; a channel without one has no handle, and
        // the title must never stand in for it.
        handle: channelDetails.customUrl?.replace(/^@/, ''),
        id: channelDetails.id,
        name: channelDetails.title,
      },
    );
  } catch (verifyError: unknown) {
    await markCredentialDisconnected(
      credentialsService,
      loggerService,
      credential.id,
    );
    throw verifyError;
  }
}

async function markCredentialDisconnected(
  credentialsService: CredentialsService,
  loggerService: LoggerService,
  credentialId: string,
): Promise<void> {
  try {
    await credentialsService.patch(credentialId, {
      isConnected: false,
    });
  } catch {
    loggerService.error(
      'Failed to mark YouTube credential disconnected after verification failure',
    );
  }
}

/**
 * Post-connection work that must never fail the connection itself: refresh
 * the authorized signals snapshot, then queue the import of the channel's
 * existing uploads. Both are best-effort and logged on failure.
 */
async function finalizeConnection(params: {
  accessToken: string | null | undefined;
  credential: CredentialDocument;
  credentialsService: CredentialsService;
  grantedScopes: string | undefined;
  historyImportService: SocialSourceHistoryImportService;
  loggerService: LoggerService;
  organizationId: string;
  url: string;
  youtubeAuthorizedSignalsService: YoutubeAuthorizedSignalsService;
}): Promise<CredentialDocument> {
  const {
    accessToken,
    credentialsService,
    grantedScopes,
    historyImportService,
    loggerService,
    organizationId,
    url,
    youtubeAuthorizedSignalsService,
  } = params;
  let credential = params.credential;
  try {
    await youtubeAuthorizedSignalsService.refresh({
      accessToken: accessToken ?? undefined,
      credentialId: credential.id.toString(),
      force: true,
      grantedScopes,
      organizationId,
    });
    credential =
      (await credentialsService.findOne({
        id: credential.id.toString(),
        organizationId,
        platform: CredentialPlatform.YOUTUBE,
      })) ?? credential;
  } catch (signalError: unknown) {
    loggerService.warn(
      `${url} authorized signal refresh failed after connection`,
      signalError,
    );
  }
  try {
    await historyImportService.scheduleForCredential({
      credentialId: credential.id.toString(),
      organizationId,
    });
  } catch (scheduleError: unknown) {
    loggerService.warn(
      `${url} history import scheduling failed after connection`,
      scheduleError,
    );
  }
  return credential;
}
