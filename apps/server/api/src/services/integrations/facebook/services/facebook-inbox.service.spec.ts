import { FacebookInboxService } from '@api/services/integrations/facebook/services/facebook-inbox.service';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

interface GraphRequest {
  body?: unknown;
  method: 'GET' | 'POST';
  params: Record<string, unknown>;
  url: string;
}

function createService(options: {
  credential?: Record<string, unknown> | null;
  graphData?: unknown;
  pages?: Array<{ accessToken?: string; id: string }>;
  postData?: unknown;
}) {
  const requests: GraphRequest[] = [];
  const credential =
    options.credential === undefined
      ? {
          externalId: 'page-1',
          grantedScopes: ['pages_manage_metadata'],
          id: 'cred-1',
        }
      : options.credential;
  const service = new FacebookInboxService(
    { get: () => undefined } as never,
    { resolveBrandAccount: async () => credential } as never,
    {
      getUserPages: async () =>
        options.pages ?? [{ accessToken: 'page-token', id: 'page-1' }],
    } as never,
    {
      get: (url: string, config: { params: Record<string, unknown> }) => {
        requests.push({ method: 'GET', params: config.params, url });
        return of({ data: options.graphData ?? { data: [] } });
      },
      post: (
        url: string,
        body: unknown,
        config: { params: Record<string, unknown> },
      ) => {
        requests.push({ body, method: 'POST', params: config.params, url });
        return of({ data: options.postData ?? { success: true } });
      },
    } as never,
    { log: vi.fn(), warn: vi.fn() } as never,
  );

  return { requests, service };
}

describe('FacebookInboxService.listPageComments', () => {
  it("returns the comments on the Page's posts, read with the Page token", async () => {
    const { requests, service } = createService({
      graphData: {
        data: [
          {
            comments: {
              data: [
                {
                  created_time: '2026-11-23T10:00:00+0000',
                  from: { id: '777', name: 'Taylor' },
                  id: 'page-1_55',
                  message: 'Love this',
                },
              ],
            },
            id: 'page-1_9',
            message: 'Launch day',
          },
        ],
      },
    });

    const comments = await service.listPageComments(
      'org-1',
      'brand-1',
      'cred-1',
      40,
    );

    expect(comments).toEqual([
      {
        authorExternalId: '777',
        authorName: 'Taylor',
        commentId: 'page-1_55',
        createdAt: new Date('2026-11-23T10:00:00.000Z'),
        isFromPage: false,
        postId: 'page-1_9',
        postTitle: 'Launch day',
        postUrl: undefined,
        text: 'Love this',
        threadId: 'page-1_55',
      },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/\/page-1\/published_posts$/);
    expect(requests[0]?.params.access_token).toBe('page-token');
    expect(requests[0]?.params.fields).toContain('comments.filter(stream)');
    expect(requests[0]?.params.fields).toContain('.limit(40)');
  });

  it('refuses a connection that is not bound to a Page', async () => {
    const { requests, service } = createService({
      credential: { externalId: null, id: 'cred-1' },
    });

    await expect(
      service.listPageComments('org-1', 'brand-1', 'cred-1'),
    ).rejects.toThrow('not bound to a Page');
    expect(requests).toEqual([]);
  });

  it('asks the user to reconnect when the account no longer manages the Page', async () => {
    const { requests, service } = createService({ pages: [{ id: 'other' }] });

    await expect(
      service.listPageComments('org-1', 'brand-1', 'cred-1'),
    ).rejects.toThrow('Reconnect it');
    expect(requests).toEqual([]);
  });
});

describe('FacebookInboxService.ensureWebhookSubscription', () => {
  it('subscribes the Page to the feed field with the Page token', async () => {
    const { requests, service } = createService({});

    await service.ensureWebhookSubscription('org-1', 'brand-1', 'cred-1');

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      params: { access_token: 'page-token', subscribed_fields: 'feed' },
    });
    expect(requests[0]?.url).toMatch(/\/page-1\/subscribed_apps$/);
  });

  it('asks the user to reconnect, without calling Meta, when pages_manage_metadata was not granted', async () => {
    const { requests, service } = createService({
      credential: {
        externalId: 'page-1',
        grantedScopes: ['pages_manage_posts'],
        id: 'cred-1',
      },
    });

    const attempt = service.ensureWebhookSubscription(
      'org-1',
      'brand-1',
      'cred-1',
    );

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toThrow('grant pages_manage_metadata');
    expect(requests).toEqual([]);
  });
});

describe('FacebookInboxService subscription fields', () => {
  it('also subscribes the Page to messages when pages_messaging was granted', async () => {
    const { requests, service } = createService({
      credential: {
        externalId: 'page-1',
        grantedScopes: ['pages_manage_metadata', 'pages_messaging'],
        id: 'cred-1',
      },
    });

    await service.ensureWebhookSubscription('org-1', 'brand-1', 'cred-1');

    expect(requests[0]?.params.subscribed_fields).toBe('feed,messages');
  });
});

describe('FacebookInboxService.listMessengerThreads', () => {
  const messengerCredential = {
    externalId: 'page-1',
    grantedScopes: ['pages_messaging'],
    id: 'cred-1',
  };

  it("returns the person's messages from the Page's Messenger conversations", async () => {
    const { requests, service } = createService({
      credential: messengerCredential,
      graphData: {
        data: [
          {
            id: 't_100',
            messages: {
              data: [
                {
                  created_time: '2026-11-23T10:00:00+0000',
                  from: { id: 'psid-1', name: 'Taylor' },
                  id: 'm_1',
                  message: 'Do you ship to the EU?',
                },
                {
                  created_time: '2026-11-23T10:01:00+0000',
                  from: { id: 'page-1', name: 'Acme Page' },
                  id: 'm_2',
                  message: 'Yes',
                },
              ],
            },
            participants: {
              data: [
                { id: 'psid-1', name: 'Taylor' },
                { id: 'page-1', name: 'Acme Page' },
              ],
            },
          },
        ],
      },
    });

    const threads = await service.listMessengerThreads(
      'org-1',
      'brand-1',
      'cred-1',
      30,
    );

    expect(threads).toEqual([
      {
        conversationId: 't_100',
        messages: [
          {
            createdAt: new Date('2026-11-23T10:00:00.000Z'),
            messageId: 'm_1',
            senderExternalId: 'psid-1',
            senderName: 'Taylor',
            text: 'Do you ship to the EU?',
          },
        ],
        participantExternalId: 'psid-1',
        participantName: 'Taylor',
      },
    ]);
    expect(requests[0]?.url).toMatch(/\/page-1\/conversations$/);
    expect(requests[0]?.params).toMatchObject({
      access_token: 'page-token',
      limit: 30,
      platform: 'messenger',
    });
  });

  it('asks the user to reconnect, without calling Meta, when pages_messaging was not granted', async () => {
    const { requests, service } = createService({
      credential: {
        externalId: 'page-1',
        grantedScopes: ['pages_manage_metadata'],
        id: 'cred-1',
      },
    });

    await expect(
      service.listMessengerThreads('org-1', 'brand-1', 'cred-1'),
    ).rejects.toThrow('grant pages_messaging');
    expect(requests).toEqual([]);
  });
});

describe('FacebookInboxService.sendMessengerMessage', () => {
  const messengerCredential = {
    externalId: 'page-1',
    grantedScopes: ['pages_messaging'],
    id: 'cred-1',
  };

  it('sends a RESPONSE to the person as the Page and returns the message id', async () => {
    const { requests, service } = createService({
      credential: messengerCredential,
      postData: { message_id: 'm_sent', recipient_id: 'psid-1' },
    });

    await expect(
      service.sendMessengerMessage(
        'org-1',
        'brand-1',
        'cred-1',
        'psid-1',
        'Yes, we ship to the EU.',
      ),
    ).resolves.toBe('m_sent');
    expect(requests[0]?.url).toMatch(/\/page-1\/messages$/);
    expect(requests[0]?.params.access_token).toBe('page-token');
    expect(requests[0]?.body).toEqual({
      message: { text: 'Yes, we ship to the EU.' },
      messaging_type: 'RESPONSE',
      recipient: { id: 'psid-1' },
    });
  });

  it('fails when Meta accepts the call but returns no message id', async () => {
    const { service } = createService({
      credential: messengerCredential,
      postData: {},
    });

    await expect(
      service.sendMessengerMessage(
        'org-1',
        'brand-1',
        'cred-1',
        'psid-1',
        'Hi',
      ),
    ).rejects.toThrow('did not return the sent message id');
  });
});
