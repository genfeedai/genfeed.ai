import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  EXTERNAL_CONNECTION_DENIED_STATE,
  EXTERNAL_CONNECTION_FAILED_STATE,
} from '@genfeedai/helpers/integrations/external-connection-request.helper';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('throwIfOAuthCallbackError', () => {
  const credentialsService = {
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns without querying when the callback has no error code', async () => {
    await throwIfOAuthCallbackError(
      credentialsService,
      { state: 'opaque-state' },
      CredentialPlatform.TWITTER,
    );

    expect(
      credentialsService.findPendingOAuthCredential,
    ).not.toHaveBeenCalled();
    expect(credentialsService.patch).not.toHaveBeenCalled();
  });

  it('persists access_denied onto the pending credential', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValue({
      id: 'cred-1',
      isConnected: false,
    });

    await expect(
      throwIfOAuthCallbackError(
        credentialsService,
        { error: 'access_denied', state: 'opaque-state' },
        CredentialPlatform.TWITTER,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.BAD_REQUEST
      );
    });

    expect(credentialsService.findPendingOAuthCredential).toHaveBeenCalledWith(
      'opaque-state',
      CredentialPlatform.TWITTER,
    );
    expect(credentialsService.patch).toHaveBeenCalledWith('cred-1', {
      oauthState: EXTERNAL_CONNECTION_DENIED_STATE,
    });
  });

  it('persists a non-denial provider error as failed', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValue({
      id: 'cred-1',
      isConnected: false,
    });

    await expect(
      throwIfOAuthCallbackError(
        credentialsService,
        { error: 'server_error', state: 'opaque-state' },
        CredentialPlatform.YOUTUBE,
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(credentialsService.patch).toHaveBeenCalledWith('cred-1', {
      oauthState: EXTERNAL_CONNECTION_FAILED_STATE,
    });
  });

  it('does not overwrite an already-connected credential', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValue({
      id: 'cred-1',
      isConnected: true,
    });

    await expect(
      throwIfOAuthCallbackError(
        credentialsService,
        { error: 'access_denied', state: 'opaque-state' },
        CredentialPlatform.TWITTER,
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(credentialsService.patch).not.toHaveBeenCalled();
  });
});
