import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IOnboardingFirstDraftsResult } from '@genfeedai/contracts/interfaces';
import { OnboardingDraftRunsService } from './onboarding-draft-runs.service';

const user = { id: 'user-1', organizationId: 'org-1' } as AuthenticatedUser;
const result: IOnboardingFirstDraftsResult = {
  drafts: [
    {
      postId: 'post-1',
      receiptId: 'receipt-1',
      requestKey: 'key-1',
      platform: 'twitter',
      text: 'Saved text',
      isProvisional: false,
    },
  ],
  imageIngredientId: null,
  imageUrl: null,
  requestKey: 'key-1',
  status: 'partial',
};

describe('OnboardingDraftRunsService', () => {
  const prisma = {
    contentRun: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    brandedGenerationFeedback: { findMany: vi.fn() },
    brandedGenerationReceipt: { findMany: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { updateMany: vi.fn(), findMany: vi.fn() },
    postIngredient: { createMany: vi.fn() },
  };
  const service = new OnboardingDraftRunsService(
    prisma as never,
    { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.contentRun.createMany.mockResolvedValue({ count: 1 });
    prisma.contentRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.brandedGenerationFeedback.findMany.mockResolvedValue([]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    prisma.brandedGenerationReceipt.findMany.mockResolvedValue([]);
    prisma.ingredient.findFirst.mockResolvedValue(null);
  });

  it('saves the successful response and replays it without calling generation', async () => {
    const generate = vi.fn().mockResolvedValue(result);
    await expect(
      service.execute(user, 'brand-1', undefined, generate),
    ).resolves.toEqual(result);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prisma.contentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          config: expect.objectContaining({
            brief: { angle: expect.any(String) },
            variants: [
              expect.objectContaining({
                id: 'post-1',
                platform: 'twitter',
                content: 'Saved text',
              }),
            ],
          }),
        },
      }),
    );
    prisma.contentRun.createMany.mockResolvedValue({ count: 0 });
    prisma.contentRun.findFirst.mockResolvedValue({
      status: 'complete',
      config: { surface: 'onboarding', result },
    });
    await expect(
      service.execute(user, 'brand-1', undefined, generate),
    ).resolves.toEqual(result);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a request reserved by another process', async () => {
    prisma.contentRun.createMany.mockResolvedValue({ count: 0 });
    prisma.contentRun.findFirst.mockResolvedValue({
      status: 'running',
      config: { surface: 'onboarding', result: null },
    });
    const generate = vi.fn();
    await expect(
      service.execute(user, 'brand-1', undefined, generate),
    ).rejects.toThrow('Recover');
    expect(generate).not.toHaveBeenCalled();
  });

  it('retains partial results when the process is interrupted and never releases the reservation', async () => {
    const generate = vi.fn(async (save) => {
      await save(result);
      throw new Error('interrupted');
    });
    await expect(
      service.execute(user, 'brand-1', undefined, generate),
    ).rejects.toThrow('interrupted');
    expect(prisma.contentRun.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          config: expect.objectContaining({ surface: 'onboarding', result }),
        }),
      }),
    );
    expect(prisma.contentRun.createMany).toHaveBeenCalledTimes(1);
  });

  it('restores only this member’s ratings and scopes every read to the organization and brand', async () => {
    prisma.contentRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'complete',
      updatedAt: new Date(),
      config: { surface: 'onboarding', result },
    });
    prisma.brandedGenerationFeedback.findMany.mockResolvedValue([
      { receiptId: 'receipt-1', rating: 'down' },
    ]);
    await expect(service.latest(user, 'brand-1')).resolves.toMatchObject({
      verdicts: { 'post-1': 'down' },
      result,
      status: 'complete',
    });
    expect(prisma.contentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
        }),
      }),
    );
    expect(prisma.brandedGenerationFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          actorId: 'user-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('uses a different reservation for another tenant or an explicit next round', async () => {
    const generate = vi.fn().mockResolvedValue(result);
    await service.execute(user, 'brand-1', undefined, generate);
    await service.execute(user, 'brand-1', 'previous-request', generate);
    await service.execute(
      { ...user, organizationId: 'org-2' },
      'brand-1',
      undefined,
      generate,
    );
    const ids = prisma.contentRun.createMany.mock.calls.map(
      ([args]) => args.data[0].id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('reconciles a pending video from its saved ingredient without generating', async () => {
    prisma.contentRun.findFirst.mockResolvedValue({
      id: 'run-1',
      status: 'complete',
      updatedAt: new Date(),
      config: {
        surface: 'onboarding',
        result: {
          ...result,
          videoIngredientId: 'video-1',
          videoStatus: 'pending',
        },
      },
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      status: 'GENERATED',
      s3Key: 'video/saved.mp4',
    });
    const run = await service.latest(user, 'brand-1');
    expect(run?.result?.videoUrl).toBe(
      'https://cdn.example.com/video/saved.mp4',
    );
    expect(run?.result?.videoStatus).toBe('ready');
    expect(run?.status).toBe('complete');
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'video-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
        },
      }),
    );
  });

  it('attaches scoped media to draft posts for editing after onboarding', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
    await service.execute(
      user,
      'brand-1',
      undefined,
      vi.fn().mockResolvedValue({ ...result, imageIngredientId: 'image-1' }),
    );
    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          status: 'draft',
          description: 'Saved text',
          contentRunId: null,
          ingredientLinks: { none: {} },
        },
      }),
    );
    expect(prisma.postIngredient.createMany).toHaveBeenCalledWith({
      data: [
        {
          postId: 'post-1',
          ingredientId: 'image-1',
          organizationId: 'org-1',
          position: 0,
        },
      ],
      skipDuplicates: true,
    });
  });
  it('keeps processing and failed ingredients out of editable posts', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await service.execute(
      user,
      'brand-1',
      undefined,
      vi
        .fn()
        .mockResolvedValue({ ...result, imageIngredientId: 'pending-image' }),
    );
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['GENERATED', 'UPLOADED', 'VALIDATED'] },
        }),
      }),
    );
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(prisma.postIngredient.createMany).not.toHaveBeenCalled();
  });

  it('attaches a video that became ready after the original request returned', async () => {
    prisma.contentRun.findFirst.mockResolvedValue({
      id: 'saved-run',
      status: 'completed',
      updatedAt: new Date(),
      config: {
        surface: 'onboarding',
        result: {
          ...result,
          drafts: [{ ...result.drafts[0], platform: 'tiktok' }],
          videoIngredientId: 'video-1',
          videoStatus: 'pending',
        },
      },
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'video-1',
      status: 'GENERATED',
      s3Key: 'video/ready.mp4',
    });
    const run = await service.latest(user, 'brand-1');
    expect(run?.result?.videoStatus).toBe('ready');
    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { contentRunId: 'saved-run', category: 'VIDEO' },
      }),
    );
    expect(prisma.postIngredient.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            ingredientId: 'video-1',
            organizationId: 'org-1',
          }),
        ],
      }),
    );
  });

  it('does not restart an empty interrupted run because dispatch may have occurred before a checkpoint', async () => {
    prisma.contentRun.createMany.mockResolvedValue({ count: 0 });
    prisma.contentRun.findFirst.mockResolvedValue({
      status: 'failed',
      config: { surface: 'onboarding', result: null },
    });
    const generate = vi.fn();
    await expect(
      service.execute(user, 'brand-1', undefined, generate),
    ).rejects.toThrow('Recover');
    expect(generate).not.toHaveBeenCalled();
  });

  it('recovers pre-existing onboarding drafts instead of offering another paid generation', async () => {
    prisma.contentRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'legacy',
        status: 'complete',
        updatedAt: new Date(),
        config: { surface: 'onboarding', result },
      });
    prisma.brandedGenerationReceipt.findMany.mockResolvedValue([
      { id: 'receipt-1', requestKey: 'key-1', state: 'ready' },
    ]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        platform: 'twitter',
        description: 'Saved text',
        brandedReceiptId: 'receipt-1',
      },
    ]);
    const run = await service.latest(user, 'brand-1');
    expect(prisma.contentRun.findFirst).toHaveBeenCalledTimes(1);
    expect(run?.result?.drafts[0].postId).toBe('post-1');
    expect(prisma.contentRun.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
  it('recovers posts referenced by a receipt artifact even without a post receipt field', async () => {
    prisma.contentRun.findFirst.mockResolvedValue(null);
    prisma.brandedGenerationReceipt.findMany.mockResolvedValue([
      {
        id: 'receipt-1',
        requestKey: 'key-1',
        state: 'ready',
        projection: { artifact: { kind: 'post', id: 'post-legacy' } },
      },
    ]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-legacy',
        platform: 'instagram',
        description: 'Already paid for',
        brandedReceiptId: null,
      },
    ]);
    prisma.brandedGenerationFeedback.findMany.mockResolvedValue([
      { receiptId: 'receipt-1', rating: 'up' },
    ]);
    const run = await service.latest(user, 'brand-1');
    expect(run?.result?.drafts[0]).toMatchObject({
      postId: 'post-legacy',
      receiptId: 'receipt-1',
      text: 'Already paid for',
    });
    expect(run?.verdicts).toEqual({ 'post-legacy': 'up' });
    expect(prisma.contentRun.findFirst).toHaveBeenCalledTimes(1);
  });

  describe('retryMedia', () => {
    const updatedAt = new Date();
    const row = (
      config: Record<string, unknown> = {},
      status = 'completed',
    ) => ({
      id: 'run-1',
      status,
      updatedAt,
      config: { surface: 'onboarding', result, ...config },
    });
    const withImage = { ...result, imageIngredientId: 'img-2', imageUrl: 'u' };

    it('generates only the missing media, spends one retry and finishes the run', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row());
      const generate = vi.fn().mockResolvedValue(withImage);
      await expect(
        service.retryMedia(user, 'brand-1', generate),
      ).resolves.toEqual(withImage);
      expect(generate).toHaveBeenCalledWith(
        { image: true, video: false },
        result,
        expect.any(Function),
      );
      const writes = prisma.contentRun.updateMany.mock.calls.map(
        ([args]) => args,
      );
      expect(writes[0]).toMatchObject({
        where: {
          id: 'run-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          updatedAt,
        },
        data: { status: 'running', config: { mediaRetries: 1 } },
      });
      expect(writes.at(-1)).toMatchObject({ data: { status: 'completed' } });
    });

    it('does not start a second retry from a tab that read the run earlier', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row());
      prisma.contentRun.updateMany.mockResolvedValue({ count: 0 });
      const generate = vi.fn();
      await expect(
        service.retryMedia(user, 'brand-1', generate),
      ).rejects.toThrow('still being created');
      expect(generate).not.toHaveBeenCalled();
    });

    it('refuses while the run is still working', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row({}, 'running'));
      const generate = vi.fn();
      await expect(
        service.retryMedia(user, 'brand-1', generate),
      ).rejects.toThrow('still being created');
      expect(generate).not.toHaveBeenCalled();
    });

    it('refuses once the run has used its retries', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row({ mediaRetries: 2 }));
      const generate = vi.fn();
      await expect(
        service.retryMedia(user, 'brand-1', generate),
      ).rejects.toThrow('media retries');
      expect(generate).not.toHaveBeenCalled();
    });

    it('returns the saved run untouched when no media is missing', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row({ result: withImage }));
      prisma.ingredient.findFirst.mockResolvedValue({
        status: 'GENERATED',
        s3Key: 'image/saved.png',
      });
      const generate = vi.fn();
      const returned = await service.retryMedia(user, 'brand-1', generate);
      expect(returned.imageUrl).toBe('https://cdn.example.com/image/saved.png');
      expect(generate).not.toHaveBeenCalled();
      expect(prisma.contentRun.updateMany).not.toHaveBeenCalled();
    });

    it('marks the run finished, not interrupted, when generation throws', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row());
      const generate = vi.fn().mockRejectedValue(new Error('provider down'));
      await expect(
        service.retryMedia(user, 'brand-1', generate),
      ).rejects.toThrow('provider down');
      expect(prisma.contentRun.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { status: 'completed' } }),
      );
    });

    it('reports the retries left when reading a run', async () => {
      prisma.contentRun.findFirst.mockResolvedValue(row({ mediaRetries: 1 }));
      await expect(service.latest(user, 'brand-1')).resolves.toMatchObject({
        mediaRetriesRemaining: 1,
      });
    });
  });
});
