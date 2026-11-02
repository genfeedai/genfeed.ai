import { InstagramWebhookService } from '@api/collections/social-inbox/services/instagram-webhook.service';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const BODY = Buffer.from(
  '{"object":"instagram","entry":[{"id":"1784","messaging":[{"message":{"mid":"m1","text":"hi"}}]}]}',
);
const SIGNATURE =
  'sha256=df1d857ef310fdd0fedcebb22b0d586c208c301e9cb8d62b432d4a8a6809b65a';

function createService(options: {
  config?: Record<string, string>;
  credentials?: Array<{
    brandId: string | null;
    id: string;
    organizationId: string | null;
    userId: string | null;
  }>;
  isDebounced?: boolean;
}) {
  const config = options.config ?? {
    INSTAGRAM_APP_SECRET: 'app-secret',
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: 'verify-me',
  };
  const enqueued: unknown[] = [];
  const service = new InstagramWebhookService(
    { get: (key: string) => config[key] } as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    {
      credential: {
        findMany: async () => options.credentials ?? [],
      },
    } as never,
    {
      getPublisher: () => ({
        set: async () => (options.isDebounced ? null : 'OK'),
      }),
    } as never,
    {
      enqueue: async (input: unknown) => {
        enqueued.push(input);
        return 'job-1';
      },
    } as never,
  );

  return { enqueued, service };
}

const CREDENTIAL = {
  brandId: 'brand-1',
  id: 'cred-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('InstagramWebhookService.verifyChallenge', () => {
  it('echoes the challenge when mode and token match', () => {
    const { service } = createService({});

    expect(
      service.verifyChallenge('subscribe', 'verify-me', '1158201444'),
    ).toBe('1158201444');
  });

  it('refuses a wrong token', () => {
    const { service } = createService({});

    expect(() =>
      service.verifyChallenge('subscribe', 'wrong', '1158201444'),
    ).toThrow(ForbiddenException);
  });

  it('is unavailable when no verify token is configured', () => {
    const { service } = createService({ config: {} });

    expect(() => service.verifyChallenge('subscribe', 'anything', '1')).toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('InstagramWebhookService.receiveEvent', () => {
  it('rejects a delivery with a bad signature', async () => {
    const { service } = createService({ credentials: [CREDENTIAL] });

    await expect(service.receiveEvent(BODY, 'sha256=00')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('queues a Direct message sync for the account owner', async () => {
    const { enqueued, service } = createService({ credentials: [CREDENTIAL] });

    await expect(service.receiveEvent(BODY, SIGNATURE)).resolves.toEqual({
      accounts: 1,
      enqueued: 1,
    });
    expect(enqueued).toEqual([
      {
        brandId: 'brand-1',
        conversationType: 'dm',
        credentialId: 'cred-1',
        organizationId: 'org-1',
        platform: 'instagram',
        userId: 'user-1',
      },
    ]);
  });

  it('skips a credential whose sync was just queued', async () => {
    const { enqueued, service } = createService({
      credentials: [CREDENTIAL],
      isDebounced: true,
    });

    await expect(service.receiveEvent(BODY, SIGNATURE)).resolves.toEqual({
      accounts: 1,
      enqueued: 0,
    });
    expect(enqueued).toEqual([]);
  });

  it('accepts a delivery for an account Genfeed does not know', async () => {
    const { service } = createService({ credentials: [] });

    await expect(service.receiveEvent(BODY, SIGNATURE)).resolves.toEqual({
      accounts: 1,
      enqueued: 0,
    });
  });
});
