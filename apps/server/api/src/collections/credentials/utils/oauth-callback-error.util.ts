import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  EXTERNAL_CONNECTION_DENIED_STATE,
  EXTERNAL_CONNECTION_FAILED_STATE,
  oauthCallbackErrorState,
} from '@genfeedai/helpers/integrations/external-connection-request.helper';
import { HttpException, HttpStatus } from '@nestjs/common';

type OAuthCallbackErrorDto = {
  error?: string;
  state?: string;
};

type OAuthCallbackCredentialStore = Pick<
  CredentialsService,
  'findPendingOAuthCredential' | 'patch'
>;

/**
 * Persist a provider OAuth error onto the pending credential so CLI/MCP
 * status polling sees `denied` or `failed` instead of waiting until TTL
 * expiry. No-ops when the callback did not include an error code.
 */
export async function throwIfOAuthCallbackError(
  credentialsService: OAuthCallbackCredentialStore,
  dto: OAuthCallbackErrorDto,
  platform: CredentialPlatform,
): Promise<void> {
  const error =
    typeof dto.error === 'string' && dto.error.trim().length > 0
      ? dto.error.trim()
      : undefined;
  if (!error) {
    return;
  }

  const state =
    typeof dto.state === 'string' && dto.state.trim().length > 0
      ? dto.state.trim()
      : undefined;
  if (!state) {
    throw new HttpException(
      {
        detail: 'Missing OAuth state for the provider callback error',
        title: 'Invalid payload',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const outcome = oauthCallbackErrorState(error);
  const credential = await credentialsService.findPendingOAuthCredential(
    state,
    platform,
  );

  if (!credential || credential.isConnected) {
    throw new HttpException(
      {
        detail:
          outcome === 'denied'
            ? 'Authorization was denied. Connect again to retry.'
            : 'Authorization failed. Connect again to retry.',
        title:
          outcome === 'denied'
            ? 'Authorization denied'
            : 'Authorization failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  await credentialsService.patch(credential.id, {
    oauthState:
      outcome === 'denied'
        ? EXTERNAL_CONNECTION_DENIED_STATE
        : EXTERNAL_CONNECTION_FAILED_STATE,
  });

  throw new HttpException(
    {
      detail:
        outcome === 'denied'
          ? 'Authorization was denied. Connect again to retry.'
          : 'Authorization failed. Connect again to retry.',
      title:
        outcome === 'denied' ? 'Authorization denied' : 'Authorization failed',
    },
    HttpStatus.BAD_REQUEST,
  );
}
