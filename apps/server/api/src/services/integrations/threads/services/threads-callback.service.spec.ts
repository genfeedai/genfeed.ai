import { createHmac } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ThreadsCallbackService } from '@api/services/integrations/threads/services/threads-callback.service';
import { verifyThreadsDeletionReceipt } from '@api/services/integrations/threads/services/threads-callback-signature.util';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const SECRET = 'threads-app-secret';

function createSignedRequest(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      algorithm: 'HMAC-SHA256',
      user_id: userId,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');
  return `${signature}.${payload}`;
}

describe('ThreadsCallbackService', () => {
  const credentialsService = { purgeProviderAccount: vi.fn() };
  const loggerService = { log: vi.fn() };
  let configValues: Record<string, string | undefined>;
  let service: ThreadsCallbackService;

  beforeEach(() => {
    configValues = {
      GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.ai/',
      THREADS_CLIENT_SECRET: SECRET,
    };
    credentialsService.purgeProviderAccount.mockResolvedValue(1);
    service = new ThreadsCallbackService(
      {
        get: vi.fn((key: string) => configValues[key]),
      } as never,
      credentialsService as never,
      loggerService as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('purges the signed Threads account during deauthorization', async () => {
    await service.handleDeauthorization(createSignedRequest('provider-user'));

    expect(credentialsService.purgeProviderAccount).toHaveBeenCalledWith(
      CredentialPlatform.THREADS,
      'provider-user',
    );
  });

  it('returns a verifiable, identity-free status URL after deletion', async () => {
    const response = await service.handleDataDeletion(
      createSignedRequest('provider-user'),
    );

    expect(response.url).toBe(
      `https://api.genfeed.ai/v1/services/threads/data-deletion/status/${response.confirmation_code}`,
    );
    expect(response.url).not.toContain('provider-user');
    expect(
      verifyThreadsDeletionReceipt(response.confirmation_code, SECRET),
    ).toBeInstanceOf(Date);
  });

  it('rejects forged callbacks before any credential lookup', async () => {
    await expect(
      service.handleDataDeletion(`${createSignedRequest('provider-user')}x`),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(credentialsService.purgeProviderAccount).not.toHaveBeenCalled();
  });

  it('fails before deletion when the public status origin is unavailable', async () => {
    configValues.GENFEEDAI_API_PUBLIC_URL = undefined;

    await expect(
      service.handleDataDeletion(createSignedRequest('provider-user')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(credentialsService.purgeProviderAccount).not.toHaveBeenCalled();
  });

  it('fails closed when the Threads secret is unavailable', async () => {
    configValues.THREADS_CLIENT_SECRET = 'PLACEHOLDER_NOT_CONFIGURED';

    await expect(
      service.handleDeauthorization(createSignedRequest('provider-user')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(credentialsService.purgeProviderAccount).not.toHaveBeenCalled();
  });

  it('renders only valid completion receipts', async () => {
    const response = await service.handleDataDeletion(
      createSignedRequest('provider-user'),
    );

    expect(service.getDataDeletionStatus(response.confirmation_code)).toContain(
      'Threads data deletion completed at',
    );
    expect(() => service.getDataDeletionStatus('forged')).toThrow(
      NotFoundException,
    );
  });
});
