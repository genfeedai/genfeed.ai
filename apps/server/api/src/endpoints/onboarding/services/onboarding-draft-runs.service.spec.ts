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
        data: {
          status: 'interrupted',
          config: { surface: 'onboarding', result },
        },
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
    expect(run?.result?.drafts[0].postId).toBe('post-1');
    expect(prisma.contentRun.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});
