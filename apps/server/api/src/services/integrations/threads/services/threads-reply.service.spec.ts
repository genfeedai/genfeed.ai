import { ThreadsReplyService } from '@api/services/integrations/threads/services/threads-reply.service';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => value) },
}));

interface GraphRequest {
  params: Record<string, unknown>;
  url: string;
}

function createService(options: {
  conversations?: Record<string, unknown[]>;
  credential?: Record<string, unknown> | null;
  getError?: unknown;
  posts?: unknown[];
  publishError?: unknown;
}) {
  const requests: GraphRequest[] = [];
  const credential =
    options.credential === undefined
      ? { accessToken: 'threads-token', id: 'cred-1' }
      : options.credential;
  const threadsService = {
    publishText: vi.fn(async () => {
      if (options.publishError) {
        throw options.publishError;
      }
      return { threadId: 'sent-1' };
    }),
  };
  const service = new ThreadsReplyService(
    { get: () => undefined } as never,
    { resolveBrandAccount: async () => credential } as never,
    {
      get: (url: string, config: { params: Record<string, unknown> }) => {
        requests.push({ params: config.params, url });
        if (options.getError) {
          return throwError(() => options.getError);
        }
        if (url.endsWith('/me/threads')) {
          return of({ data: { data: options.posts ?? [] } });
        }
        const postId = url.split('/').at(-2) as string;
        return of({ data: { data: options.conversations?.[postId] ?? [] } });
      },
    } as never,
    { log: vi.fn() } as never,
    threadsService as never,
  );
  return { requests, service, threadsService };
}

const graphError = (status: number, code: number) => ({
  response: { data: { error: { code } }, status },
});

describe('ThreadsReplyService', () => {
  it('reads the replies of each recent post with the account token', async () => {
    const { requests, service } = createService({
      conversations: {
        'post-1': [
          {
            id: 'r1',
            replied_to: { id: 'post-1' },
            text: 'Great post',
            timestamp: '2026-11-23T10:00:00+0000',
            username: 'ada',
          },
        ],
      },
      posts: [
        { id: 'post-1', permalink: 'https://threads.example/p/1', text: 'Hi' },
      ],
    });

    const replies = await service.listReplies('org-1', 'brand-1', 'cred-1', 25);

    expect(replies).toEqual([
      expect.objectContaining({
        authorHandle: 'ada',
        isOwn: false,
        postId: 'post-1',
        postUrl: 'https://threads.example/p/1',
        replyId: 'r1',
        text: 'Great post',
        threadId: 'r1',
      }),
    ]);
    expect(requests.map((request) => request.params.access_token)).toEqual([
      'threads-token',
      'threads-token',
    ]);
  });

  it('refuses before any call when the recorded grant lacks threads_read_replies', async () => {
    const { requests, service } = createService({
      credential: {
        accessToken: 'threads-token',
        grantedScopes: ['threads_basic'],
        id: 'cred-1',
      },
    });

    await expect(
      service.listReplies('org-1', 'brand-1', 'cred-1'),
    ).rejects.toThrow(/Reconnect Threads/);
    expect(requests).toHaveLength(0);
  });

  it('asks the user to reconnect when Threads refuses for a missing permission', async () => {
    const { service } = createService({ getError: graphError(400, 10) });

    await expect(
      service.listReplies('org-1', 'brand-1', 'cred-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not ask for a reconnect on a rate limit', async () => {
    const error = graphError(400, 4);
    const { service } = createService({ getError: error });

    await expect(
      service.listReplies('org-1', 'brand-1', 'cred-1'),
    ).rejects.toBe(error);
  });

  it('sends a reply to the given reply as the connected account', async () => {
    const { service, threadsService } = createService({
      credential: {
        accessToken: 'threads-token',
        grantedScopes: ['threads_manage_replies'],
        id: 'cred-1',
      },
    });

    const result = await service.replyTo(
      'org-1',
      'brand-1',
      'r1',
      'Thank you!',
      'cred-1',
    );

    expect(result).toEqual({ replyId: 'sent-1' });
    expect(threadsService.publishText).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'Thank you!',
      'r1',
      'cred-1',
    );
  });

  it('does not publish when the recorded grant lacks threads_manage_replies', async () => {
    const { service, threadsService } = createService({
      credential: {
        accessToken: 'threads-token',
        grantedScopes: ['threads_read_replies'],
        id: 'cred-1',
      },
    });

    await expect(
      service.replyTo('org-1', 'brand-1', 'r1', 'Hi', 'cred-1'),
    ).rejects.toThrow(/Reconnect Threads/);
    expect(threadsService.publishText).not.toHaveBeenCalled();
  });

  it('asks the user to reconnect when Threads refuses a reply for a missing permission', async () => {
    const { service } = createService({
      publishError: graphError(403, 200),
    });

    await expect(
      service.replyTo('org-1', 'brand-1', 'r1', 'Hi', 'cred-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a connection that has no token', async () => {
    const { service } = createService({ credential: null });

    await expect(
      service.listReplies('org-1', 'brand-1', 'cred-1'),
    ).rejects.toThrow(/no access token/);
  });
});
