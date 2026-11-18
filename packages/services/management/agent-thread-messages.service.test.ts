import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  AgentThreadMessagesService,
  MENTION_NEEDS_SHARE,
  MENTION_NOT_ALLOWED,
  ThreadMentionRefusedError,
  ThreadMessage,
} from '@services/management/agent-thread-messages.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refusal = (meta: Record<string, unknown>, status = 409) => ({
  errors: [
    {
      detail: 'Marco cannot open this thread yet.',
      meta,
      status: String(status),
    },
  ],
});

describe('AgentThreadMessagesService', () => {
  let service: AgentThreadMessagesService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentThreadMessagesService('thread-token');
    http = installMockHttp(service);
  });

  it('lists the messages of a thread with who they mention', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([
          {
            content: 'Is the claim fine? @Marco',
            mentions: [{ id: 'user_2', name: 'Marco Rossi' }],
            role: 'user',
          },
        ]),
      ),
    );

    const messages = await service.listMessages('thread_1');

    expect(http.get).toHaveBeenCalledWith('/thread_1/messages', {
      params: { limit: 100 },
      signal: undefined,
    });
    expect(messages[0]).toBeInstanceOf(ThreadMessage);
    expect(messages[0]?.mentions).toEqual([
      { id: 'user_2', name: 'Marco Rossi' },
    ]);
  });

  it('sends the mentioned user ids and the share choice with the message', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ content: 'Hi @Marco', role: 'user' })),
    );

    const message = await service.sendMessage('thread_1', {
      content: 'Hi @Marco',
      mentionedUserIds: ['user_2'],
      shareMentioned: true,
    });

    expect(http.post).toHaveBeenCalledWith('/thread_1/messages', {
      content: 'Hi @Marco',
      mentionedUserIds: ['user_2'],
      shareMentioned: true,
    });
    expect(message.content).toBe('Hi @Marco');
  });

  it('reports a mention that needs the thread shared, and whether the author can share', async () => {
    http.post.mockRejectedValue(
      refusal({ canShare: true, reason: MENTION_NEEDS_SHARE }),
    );

    const failure = await service
      .sendMessage('thread_1', { content: 'Hi', mentionedUserIds: ['user_2'] })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ThreadMentionRefusedError);
    expect(failure).toMatchObject({
      canShare: true,
      message: 'Marco cannot open this thread yet.',
      reason: MENTION_NEEDS_SHARE,
    });
  });

  it('reports a mention that is not allowed', async () => {
    http.post.mockRejectedValue(refusal({ reason: MENTION_NOT_ALLOWED }, 400));

    await expect(
      service.sendMessage('thread_1', {
        content: 'Hi',
        mentionedUserIds: ['user_9'],
      }),
    ).rejects.toMatchObject({ canShare: false, reason: MENTION_NOT_ALLOWED });
  });

  it('treats a conflict on a message with mentions as a share prompt even when the reason is stripped', async () => {
    http.post.mockRejectedValue(
      Object.assign(new Error('Request failed with status 409'), {
        status: 409,
      }),
    );

    await expect(
      service.sendMessage('thread_1', {
        content: 'Hi',
        mentionedUserIds: ['user_2'],
      }),
    ).rejects.toMatchObject({ canShare: false, reason: MENTION_NEEDS_SHARE });
  });

  it('leaves other failures to the shared error handling', async () => {
    http.post.mockRejectedValue(new Error('network down'));

    await expect(
      service.sendMessage('thread_1', { content: 'Hi' }),
    ).rejects.not.toBeInstanceOf(ThreadMentionRefusedError);
  });
});
