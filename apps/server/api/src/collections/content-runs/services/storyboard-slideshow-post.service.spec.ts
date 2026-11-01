import { StoryboardSlideshowPostService } from '@api/collections/content-runs/services/storyboard-slideshow-post.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const plan: StoryboardPlan = {
  kind: 'slideshow',
  title: 'Five habits',
  logline: 'Swipe for five habits.',
  videoModelKey: null,
  format: '4:5',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [3, 1, 2].map((n, index) => ({
    id: `slide-${n}`,
    ordinal: index + 1,
    action: `Habit ${n}`,
    onScreenSpeaker: false,
    durationSeconds: null,
    stillAssetId: `image-${n}`,
    stillFreshness: 'fresh' as const,
    transition: 'cut' as const,
  })),
};

function setup(
  config: Record<string, unknown> = {},
  existingPostId: string | null = null,
) {
  const created: Record<string, unknown>[] = [];
  const store = {
    read: vi.fn(async () => ({
      config: {
        state: 'approved',
        revision: 4,
        approvedRevision: 4,
        plan,
        ...config,
      },
    })),
  };
  const posts = {
    create: vi.fn(async (input: Record<string, unknown>) => {
      created.push(input);
      return { id: 'post-new' };
    }),
  };
  const prisma = {
    post: {
      findFirst: vi.fn(async () =>
        existingPostId ? { id: existingPostId } : null,
      ),
    },
  };
  const service = new StoryboardSlideshowPostService(
    store as never,
    posts as never,
    prisma as never,
  );
  return { created, service };
}

describe('StoryboardSlideshowPostService', () => {
  it('makes one draft post with the slide images in swipe order', async () => {
    const { created, service } = setup();

    const result = await service.createDraft(
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      {
        expectedRevision: 4,
      },
    );

    expect(result).toEqual({
      isExisting: false,
      postId: 'post-new',
      slideCount: 3,
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      description: 'Swipe for five habits.',
      ingredients: ['image-3', 'image-1', 'image-2'],
      label: 'Five habits',
      targetExecutionState: 'draft',
    });
  });

  it('returns the same draft when the revision already has one', async () => {
    const { created, service } = setup({}, 'post-old');

    const result = await service.createDraft(
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      {
        expectedRevision: 4,
      },
    );

    expect(result).toEqual({
      isExisting: true,
      postId: 'post-old',
      slideCount: 3,
    });
    expect(created).toHaveLength(0);
  });

  it('refuses a slideshow that is not approved at its current revision', async () => {
    const { service } = setup({ approvedRevision: 3 });

    await expect(
      service.createDraft('org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 4,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a video storyboard', async () => {
    const { service } = setup({ plan: { ...plan, kind: 'video' } });

    await expect(
      service.createDraft('org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 4,
      }),
    ).rejects.toThrow('This storyboard is not a slideshow.');
  });

  it('refuses a request without a revision', async () => {
    const { service } = setup();

    await expect(
      service.createDraft('org-1', 'brand-1', 'run-1', 'user-1', {}),
    ).rejects.toThrow(BadRequestException);
  });
});
