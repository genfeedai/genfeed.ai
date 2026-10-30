import {
  ingestOwnedYoutubeComments,
  type OwnedYoutubeCommentIngestPorts,
} from '@api/collections/social-inbox/services/youtube-comment-ingestion';
import { describe, expect, it, vi } from 'vitest';

const scope = { organizationId: 'org-1' };

function credential(id: string) {
  return {
    brandId: 'brand-1',
    externalHandle: null,
    externalId: null,
    externalName: null,
    id,
    label: null,
    userId: null,
    username: null,
  };
}

function post(id: string) {
  return {
    brandId: 'brand-1',
    description: 'A video',
    externalId: `video-${id}`,
    id,
    label: null,
    url: null,
  };
}

function createPorts(
  overrides: Partial<OwnedYoutubeCommentIngestPorts>,
): OwnedYoutubeCommentIngestPorts {
  return {
    accountFields: vi.fn(() => ({})),
    findConnectedCredentials: vi.fn(async () => [credential('cred-1')]),
    findExistingExternalIds: vi.fn(),
    findOwnedPosts: vi.fn(async () => [post('p1'), post('p2'), post('p3')]),
    ingestSyncedMessage: vi.fn(),
    listVideoComments: vi.fn(async () => []),
    warn: vi.fn(),
    ...overrides,
  } as OwnedYoutubeCommentIngestPorts;
}

describe('ingestOwnedYoutubeComments', () => {
  it('reports how much it scanned so an empty import can be diagnosed', async () => {
    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({ listVideoComments: vi.fn(async () => []) }),
    );

    expect(result).toMatchObject({
      commentsSeen: 0,
      credentialsScanned: 1,
      messagesCreated: 0,
      postFailures: [],
      postsScanned: 3,
    });
  });

  it('reports zero scanned posts when no owned video is eligible', async () => {
    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({ findOwnedPosts: vi.fn(async () => []) }),
    );

    expect(result).toMatchObject({
      credentialsScanned: 1,
      postFailures: [],
      postsScanned: 0,
    });
  });

  it('stops a credential after a quota failure instead of retrying every post', async () => {
    const quotaError = Object.assign(new Error('Quota exceeded'), {
      errors: [{ reason: 'quotaExceeded' }],
    });
    const listVideoComments = vi.fn().mockRejectedValue(quotaError);

    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({ listVideoComments }),
    );

    expect(listVideoComments).toHaveBeenCalledTimes(1);
    expect(result.postFailures).toHaveLength(1);
  });

  it('keeps going past a failure that only affects one video', async () => {
    const commentsDisabled = Object.assign(new Error('Comments disabled'), {
      errors: [{ reason: 'commentsDisabled' }],
      status: 403,
    });
    const listVideoComments = vi.fn().mockRejectedValue(commentsDisabled);

    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({ listVideoComments }),
    );

    expect(listVideoComments).toHaveBeenCalledTimes(3);
    expect(result.postFailures).toHaveLength(3);
  });

  it('skips a video that no longer exists instead of failing the sweep', async () => {
    const videoNotFound = Object.assign(
      new Error(
        'The video identified by the videoId parameter could not be found.',
      ),
      { errors: [{ reason: 'videoNotFound' }], status: 404 },
    );
    const listVideoComments = vi
      .fn()
      .mockRejectedValueOnce(videoNotFound)
      .mockResolvedValue([]);

    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({ listVideoComments }),
    );

    expect(listVideoComments).toHaveBeenCalledTimes(3);
    expect(result.postFailures).toEqual([]);
    expect(result.postsScanned).toBe(2);
  });

  it('reports no scanned posts when every owned video was removed', async () => {
    const videoNotFound = Object.assign(new Error('not found'), {
      response: { data: { error: { errors: [{ reason: 'videoNotFound' }] } } },
    });

    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({
        findOwnedPosts: vi.fn(async () => [post('p1')]),
        listVideoComments: vi.fn().mockRejectedValue(videoNotFound),
      }),
    );

    expect(result).toMatchObject({
      credentialsScanned: 1,
      postFailures: [],
      postsScanned: 0,
    });
  });

  it('moves on to the next credential after a sign-in failure', async () => {
    const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
    const listVideoComments = vi
      .fn()
      .mockRejectedValueOnce(authError)
      .mockResolvedValue([]);

    const result = await ingestOwnedYoutubeComments(
      scope,
      {},
      createPorts({
        findConnectedCredentials: vi.fn(async () => [
          credential('cred-1'),
          credential('cred-2'),
        ]),
        listVideoComments,
      }),
    );

    expect(listVideoComments).toHaveBeenCalledTimes(4);
    expect(result.postFailures).toHaveLength(1);
  });
});
