import { PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useConfirmPostRemoval } from '@/features/posts/hooks/use-confirm-post-removal/use-confirm-post-removal';

type ConfirmConfig = {
  children: ReactNode;
  isError: boolean;
  label: string;
  message: string;
  onConfirm: () => Promise<void>;
};

type Removal = {
  media?: { deleted: string[]; kept: { id: string; reason: string }[] };
  postGone?: boolean;
};

/** What the screen and the API saw, written down instead of spied on. */
const world = vi.hoisted(() => ({
  confirms: [] as unknown[],
  errors: [] as string[],
  failing: new Set<string>(),
  outcomes: new Map<string, unknown>(),
  removals: [] as { id: string; includeMedia: boolean | undefined }[],
  successes: [] as string[],
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({
      closeConfirm: () => undefined,
      openConfirm: (config: unknown) => {
        world.confirms.push(config);
      },
    }),
  }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    remove: async (id: string, options: { includeMedia?: boolean }) => {
      world.removals.push({ id, includeMedia: options.includeMedia });
      if (world.failing.has(id)) {
        throw new Error('boom');
      }
      return world.outcomes.get(id);
    },
  }),
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: () => undefined },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (text: string) => world.errors.push(text),
      success: (text: string) => world.successes.push(text),
    }),
  },
}));

function stubRemoval(id: string, { media, postGone = true }: Removal = {}) {
  world.outcomes.set(id, {
    deletedOnPlatform: false,
    media: media ?? { deleted: [], kept: [] },
    platform: null,
    postId: id,
    previousStatus: 'public',
    publishedUrl: null,
    verified: { mediaGone: true, postGone },
  });
}

function post(overrides: Partial<IPost> = {}): IPost {
  return {
    description: 'Copy',
    id: 'post-1',
    ingredients: [],
    label: 'Launch post',
    status: PostStatus.PUBLIC,
    ...overrides,
  } as IPost;
}

function confirmation(): ConfirmConfig {
  return world.confirms[0] as ConfirmConfig;
}

function start(posts: IPost[]) {
  const removedBatches: string[][] = [];
  const { result } = renderHook(() => useConfirmPostRemoval());
  act(() =>
    result.current(posts, (ids) => {
      removedBatches.push(ids);
    }),
  );
  return removedBatches;
}

describe('useConfirmPostRemoval', () => {
  beforeEach(() => {
    world.confirms.length = 0;
    world.errors.length = 0;
    world.failing.clear();
    world.outcomes.clear();
    world.removals.length = 0;
    world.successes.length = 0;
  });

  it('asks first and says a published post stays on its network', () => {
    start([post()]);

    expect(world.removals).toEqual([]);
    expect(confirmation().label).toBe('titleOne');
    expect(confirmation().message).toContain('Launch post');
    expect(confirmation().isError).toBe(true);
    render(<>{confirmation().children}</>);
    expect(screen.getByText('publishedNotice')).toBeInTheDocument();
  });

  it('deletes a published post and reports it deleted', async () => {
    stubRemoval('post-1');
    const removedBatches = start([post()]);

    await act(async () => {
      await confirmation().onConfirm();
    });

    expect(world.removals).toEqual([{ id: 'post-1', includeMedia: false }]);
    expect(removedBatches).toEqual([['post-1']]);
    expect(world.successes).toEqual(['deletedOne.']);
    expect(world.errors).toEqual([]);
  });

  it('deletes the Library media too once the person ticks the option', async () => {
    stubRemoval('post-1', {
      media: {
        deleted: ['asset-1', 'asset-2'],
        kept: [{ id: 'asset-3', reason: 'used-by-another-post' }],
      },
    });
    const user = userEvent.setup();
    start([post({ ingredients: [{ id: 'asset-1' }] as IPost['ingredients'] })]);
    render(<>{confirmation().children}</>);

    await user.click(screen.getByRole('checkbox'));
    await act(async () => {
      await confirmation().onConfirm();
    });

    expect(world.removals).toEqual([{ id: 'post-1', includeMedia: true }]);
    expect(world.successes).toEqual([
      'deletedOne. mediaSummary {"deleted":2,"kept":1}',
    ]);
  });

  it('offers no media option for a post without media', () => {
    start([post()]);
    render(<>{confirmation().children}</>);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('deletes every post of a bulk selection and keeps the ones that fail', async () => {
    stubRemoval('post-1');
    stubRemoval('post-3');
    world.failing.add('post-2');
    const removedBatches = start([
      post({ id: 'post-1' }),
      post({ id: 'post-2' }),
      post({ id: 'post-3' }),
    ]);

    expect(confirmation().label).toBe('titleMany {"count":3}');
    await act(async () => {
      await confirmation().onConfirm();
    });

    expect(world.removals.map((removal) => removal.id)).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);
    expect(removedBatches).toEqual([['post-1', 'post-3']]);
    expect(world.successes).toEqual(['deletedMany {"count":2}.']);
    expect(world.errors).toEqual(['failedOne']);
  });

  it('does not report a post deleted when the read-back still finds it', async () => {
    stubRemoval('post-1', { postGone: false });
    const removedBatches = start([post()]);

    await act(async () => {
      await confirmation().onConfirm();
    });

    expect(removedBatches).toEqual([]);
    expect(world.successes).toEqual([]);
    expect(world.errors).toEqual(['notGone']);
  });

  it('asks nothing for an empty selection', () => {
    start([]);

    expect(world.confirms).toEqual([]);
  });
});
