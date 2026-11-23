import { createHmac } from 'node:crypto';
import { FacebookWebhookService } from '@api/collections/social-inbox/services/facebook-webhook.service';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const APP_SECRET = 'app-secret';
const BODY = Buffer.from(
  JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: 'feed',
            value: {
              comment_id: '1010_55',
              from: { id: '777' },
              item: 'comment',
              verb: 'add',
            },
          },
        ],
        id: '1010',
      },
    ],
    object: 'page',
  }),
);

function sign(body: Buffer, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const CREDENTIAL = {
  brandId: 'brand-1',
  id: 'cred-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function createService(
  options: {
    config?: Record<string, string>;
    credentials?: Array<typeof CREDENTIAL>;
    isDebounced?: boolean;
  } = {},
) {
  const config = options.config ?? {
    FACEBOOK_APP_SECRET: APP_SECRET,
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: 'verify-me',
  };
  const enqueued: unknown[] = [];
  const lookups: unknown[] = [];
  const service = new FacebookWebhookService(
    { get: (key: string) => config[key] } as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    {
      credential: {
        findMany: async (query: unknown) => {
          lookups.push(query);
          return options.credentials ?? [];
        },
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

  return { enqueued, lookups, service };
}

describe('FacebookWebhookService.verifyChallenge', () => {
  it('echoes the challenge when mode and token match', () => {
    const { service } = createService();

    expect(service.verifyChallenge('subscribe', 'verify-me', '42')).toBe('42');
  });

  it('refuses a wrong token', () => {
    const { service } = createService();

    expect(() => service.verifyChallenge('subscribe', 'wrong', '42')).toThrow(
      ForbiddenException,
    );
  });

  it('is unavailable when no verify token is configured', () => {
    const { service } = createService({ config: {} });

    expect(() => service.verifyChallenge('subscribe', 'x', '1')).toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('FacebookWebhookService.receiveEvent', () => {
  it('rejects a delivery with an invalid signature', async () => {
    const { enqueued, service } = createService({ credentials: [CREDENTIAL] });

    await expect(
      service.receiveEvent(BODY, sign(BODY, 'someone-elses-secret')),
    ).rejects.toThrow(UnauthorizedException);
    expect(enqueued).toEqual([]);
  });

  it('rejects a delivery with no signature', async () => {
    const { service } = createService({ credentials: [CREDENTIAL] });

    await expect(service.receiveEvent(BODY, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a body that was parsed before it reached the service', async () => {
    const { service } = createService();

    await expect(
      service.receiveEvent({ object: 'page' }, sign(BODY)),
    ).rejects.toThrow(BadRequestException);
  });

  it('queues an inbox sync for the Page owner, pinned to the resolved tenant', async () => {
    const { enqueued, lookups, service } = createService({
      credentials: [CREDENTIAL],
    });

    await expect(service.receiveEvent(BODY, sign(BODY))).resolves.toEqual({
      enqueued: 1,
      pages: 1,
    });
    expect(enqueued).toEqual([
      {
        brandId: 'brand-1',
        conversationType: 'comment',
        credentialId: 'cred-1',
        organizationId: 'org-1',
        platform: 'facebook',
        userId: 'user-1',
      },
    ]);
    expect(lookups).toEqual([
      {
        select: { brandId: true, id: true, organizationId: true, userId: true },
        take: 25,
        where: {
          externalId: '1010',
          isConnected: true,
          isDeleted: false,
          platform: 'FACEBOOK',
        },
      },
    ]);
  });

  it('queues the same sync for a Messenger message', async () => {
    const body = Buffer.from(
      JSON.stringify({
        entry: [
          {
            id: '1010',
            messaging: [
              {
                message: { mid: 'm_1', text: 'Hi' },
                recipient: { id: '1010' },
                sender: { id: '777' },
              },
            ],
          },
        ],
        object: 'page',
      }),
    );
    const { enqueued, service } = createService({ credentials: [CREDENTIAL] });

    await expect(service.receiveEvent(body, sign(body))).resolves.toEqual({
      enqueued: 1,
      pages: 1,
    });
    expect(enqueued).toEqual([
      expect.objectContaining({ credentialId: 'cred-1', platform: 'facebook' }),
    ]);
  });

  it('skips a credential whose sync was just queued', async () => {
    const { enqueued, service } = createService({
      credentials: [CREDENTIAL],
      isDebounced: true,
    });

    await expect(service.receiveEvent(BODY, sign(BODY))).resolves.toEqual({
      enqueued: 0,
      pages: 1,
    });
    expect(enqueued).toEqual([]);
  });

  it('accepts a delivery for a Page Genfeed does not know', async () => {
    const { service } = createService({ credentials: [] });

    await expect(service.receiveEvent(BODY, sign(BODY))).resolves.toEqual({
      enqueued: 0,
      pages: 1,
    });
  });
});
