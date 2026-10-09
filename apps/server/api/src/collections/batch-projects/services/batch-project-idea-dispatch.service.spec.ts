import { BatchProjectCreditsService } from '@api/collections/batch-projects/services/batch-project-credits.service';
import { BatchProjectIdeaDispatchService } from '@api/collections/batch-projects/services/batch-project-idea-dispatch.service';
import type { AvatarGenerationPrice } from '@api/collections/videos/services/avatar-video-generation.service';
import {
  BatchProjectItemStatus,
  CreditReservationStatus,
  IngredientCategory,
} from '@genfeedai/contracts';

type Row = Record<string, unknown>;
type CreditsConfig = {
  amount?: number;
  isByokBypass?: boolean;
  modelKey?: string;
  reservationId?: string;
};
type GenerationRequest = { creditsConfig?: CreditsConfig };
type PlaceholderScope = { isByokBypass?: boolean };

const job = {
  itemId: 'item-1',
  key: 'batch-project-item:item-1:dispatch:1',
  organizationId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
};

function makeDispatch(overrides: Row = {}): Row {
  return {
    attempt: 1,
    billingMode: 'platform',
    credits: 4,
    key: job.key,
    model: 'model-image',
    state: 'queued',
    ...overrides,
  };
}

function makeItem(format: string, overrides: Row = {}): Row {
  return {
    dispatch: makeDispatch(),
    id: 'item-1',
    idea: {
      caption: 'Fresh drop',
      format,
      hook: 'Meet the new mug',
      id: 'idea-1',
      platformHints: [],
      speechText: 'Say hi to the new mug',
      visualPrompt: 'A mug on a desk',
    },
    organizationId: 'org-1',
    outputIngredientId: null,
    position: 2,
    projectId: 'project-1',
    status: BatchProjectItemStatus.GENERATING,
    ...overrides,
  };
}

describe('BatchProjectIdeaDispatchService', () => {
  const prisma = {
    batchProject: { findFirst: vi.fn() },
    batchProjectItem: { findFirst: vi.fn(), updateMany: vi.fn() },
    brand: { findFirst: vi.fn() },
  };
  const creditsUtils = {
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    settleReservation: vi.fn(),
  };
  const credits = new BatchProjectCreditsService(creditsUtils as never);
  const brandKitAssets = {
    resolveBrandKitAssets: vi.fn().mockResolvedValue({
      references: [{ id: 'reference-1' }],
    }),
  };
  const providerCalls: string[] = [];
  const imageGeneration = { generateImage: vi.fn() };
  const videoGeneration = { generateVideo: vi.fn() };
  const avatarGeneration = { generateAvatarVideo: vi.fn() };
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWithRegisteredWorkflowModule: vi.fn(
      async <T>(
        _input: { canonicalId: string; organizationId: string },
        work: () => Promise<T>,
      ) => work(),
    ),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new BatchProjectIdeaDispatchService(
    prisma as never,
    logger as never,
    credits,
    brandKitAssets as never,
    imageGeneration as never,
    videoGeneration as never,
    avatarGeneration as never,
    workflowQueue as never,
    workflowRunner as never,
  );

  /**
   * Stands in for the image/video generation services: placeholder first,
   * then the deferred-credit reservation, then `onCreditsPrepared`, and only
   * if that resolves, the provider call.
   */
  function mediaGeneration(pricing: CreditsConfig) {
    return async (
      _user: unknown,
      _dto: unknown,
      request: GenerationRequest,
      onPlaceholderCreated: (id: string) => Promise<void>,
      _scope: PlaceholderScope,
      onCreditsPrepared: () => Promise<void>,
    ) => {
      await onPlaceholderCreated('ingredient-1');
      request.creditsConfig = { ...request.creditsConfig, ...pricing };
      await onCreditsPrepared();
      providerCalls.push('provider');
      return { data: { id: 'ingredient-1' } };
    };
  }

  function useItem(item: Row) {
    prisma.batchProjectItem.findFirst.mockResolvedValue(item);
  }

  function itemWrites() {
    return prisma.batchProjectItem.updateMany.mock.calls.map(
      ([args]) => args.data,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    providerCalls.length = 0;
    prisma.batchProject.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'project-1',
      organizationId: 'org-1',
    });
    prisma.batchProjectItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {
        defaultAvatarIngredientId: 'portrait-1',
        defaultVoiceId: 'voice-1',
      },
    });
    creditsUtils.reserveCredits.mockResolvedValue({
      id: 'avatar-reservation',
      status: CreditReservationStatus.RESERVED,
    });
  });

  it('denies a direct idea dispatch before loading, reserving or calling a provider', async () => {
    workflowRunner.runWithRegisteredWorkflowModule.mockRejectedValueOnce(
      new Error('Batch disabled'),
    );
    await expect(service.dispatch(job)).rejects.toThrow('Batch disabled');
    expect(prisma.batchProject.findFirst).not.toHaveBeenCalled();
    expect(creditsUtils.reserveCredits).not.toHaveBeenCalled();
    expect(imageGeneration.generateImage).not.toHaveBeenCalled();
    expect(videoGeneration.generateVideo).not.toHaveBeenCalled();
    expect(avatarGeneration.generateAvatarVideo).not.toHaveBeenCalled();
  });

  it('denies enqueue before writing a durable dispatch job', async () => {
    workflowRunner.runWithRegisteredWorkflowModule.mockRejectedValueOnce(
      new Error('Batch disabled'),
    );
    await expect(service.enqueue(job)).rejects.toThrow('Batch disabled');
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('records the reservation the generation made before the provider runs', async () => {
    useItem(makeItem('image'));
    imageGeneration.generateImage.mockImplementation(
      mediaGeneration({
        amount: 4,
        modelKey: 'model-image',
        reservationId: 'reservation-1',
      }),
    );

    await expect(service.dispatch(job)).resolves.toEqual({
      status: 'dispatched',
    });

    const [, dto, request] = imageGeneration.generateImage.mock.calls[0];
    expect(dto).toMatchObject({
      autoSelectModel: false,
      brandId: 'brand-1',
      model: 'model-image',
      references: ['reference-1'],
      sourceActionId: job.key,
      text: 'A mug on a desk',
    });
    expect(request.body).toEqual({ sourceActionId: job.key });
    expect(itemWrites()).toContainEqual(
      expect.objectContaining({
        outputCategory: IngredientCategory.IMAGE,
        outputIngredientId: 'ingredient-1',
      }),
    );
    expect(itemWrites()).toContainEqual({
      dispatch: expect.objectContaining({
        reservationId: 'reservation-1',
        state: 'reserved',
      }),
    });
    expect(providerCalls).toEqual(['provider']);
  });

  it('never reaches the provider without a reservation for a paid line', async () => {
    useItem(makeItem('image'));
    imageGeneration.generateImage.mockImplementation(
      mediaGeneration({ amount: 4, modelKey: 'model-image' }),
    );

    await expect(service.dispatch(job)).resolves.toEqual({
      status: 'failed',
    });

    expect(providerCalls).toEqual([]);
    expect(itemWrites()).toContainEqual(
      expect.objectContaining({ status: BatchProjectItemStatus.FAILED }),
    );
  });

  it('releases a reservation priced differently from the accepted quote', async () => {
    useItem(makeItem('image'));
    imageGeneration.generateImage.mockImplementation(
      mediaGeneration({
        amount: 9,
        modelKey: 'model-image',
        reservationId: 'reservation-1',
      }),
    );

    await service.dispatch(job);

    expect(creditsUtils.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(providerCalls).toEqual([]);
  });

  it('requests a video at the exact parameters its quote priced', async () => {
    useItem(
      makeItem('video', {
        dispatch: makeDispatch({ credits: 20, model: 'model-video' }),
      }),
    );
    videoGeneration.generateVideo.mockResolvedValue({
      data: { id: 'video-1' },
    });

    await service.dispatch(job);

    const [, dto] = videoGeneration.generateVideo.mock.calls[0];
    expect(dto).toEqual(
      expect.objectContaining({ duration: 10, height: 1920, width: 1080 }),
    );
  });

  it('reserves an avatar line itself, right before the provider call', async () => {
    creditsUtils.reserveCredits.mockImplementation(async () => {
      providerCalls.push('reserve');
      return {
        id: 'avatar-reservation',
        status: CreditReservationStatus.RESERVED,
      };
    });
    useItem(
      makeItem('avatar', {
        dispatch: makeDispatch({ credits: 8, model: 'heygen-avatar' }),
      }),
    );
    avatarGeneration.generateAvatarVideo.mockImplementation(
      async (
        _params: unknown,
        _context: unknown,
        onPlaceholderCreated: (id: string) => Promise<void>,
        _scope: PlaceholderScope,
        onCreditsPrepared: (price: AvatarGenerationPrice) => Promise<void>,
      ) => {
        await onPlaceholderCreated('avatar-video-1');
        await onCreditsPrepared({ billingMode: 'platform', credits: 8 });
        providerCalls.push('heygen');
      },
    );

    await service.dispatch(job);

    // Identity resolution turns the brand's saved voice into the provider
    // voice; the internal voice id is never sent as an ElevenLabs id.
    const [params] = avatarGeneration.generateAvatarVideo.mock.calls[0];
    expect(params).toEqual({
      aspectRatio: '9:16',
      text: 'Say hi to the new mug',
      useIdentity: true,
    });
    expect(creditsUtils.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 8,
        idempotencyKey: job.key,
        organizationId: 'org-1',
      }),
    );
    expect(providerCalls).toEqual(['reserve', 'heygen']);
    expect(itemWrites()).toContainEqual({
      dispatch: expect.objectContaining({
        reservationId: 'avatar-reservation',
        state: 'reserved',
      }),
    });
  });

  it('skips platform credits for a line billed to the org key', async () => {
    useItem(
      makeItem('avatar', {
        dispatch: makeDispatch({
          billingMode: 'byok',
          credits: 0,
          model: 'heygen-avatar',
        }),
      }),
    );
    avatarGeneration.generateAvatarVideo.mockImplementation(
      async (
        _params: unknown,
        _context: unknown,
        onPlaceholderCreated: (id: string) => Promise<void>,
        scope: PlaceholderScope,
        onCreditsPrepared: (price: AvatarGenerationPrice) => Promise<void>,
      ) => {
        expect(scope.isByokBypass).toBe(true);
        await onPlaceholderCreated('avatar-video-1');
        await onCreditsPrepared({ billingMode: 'byok', credits: 0 });
        providerCalls.push('heygen');
      },
    );

    await service.dispatch(job);

    expect(creditsUtils.reserveCredits).not.toHaveBeenCalled();
    expect(providerCalls).toEqual(['heygen']);
  });

  it('stops an avatar before paid calls when its accepted BYOK funding changed', async () => {
    useItem(
      makeItem('avatar', {
        dispatch: makeDispatch({
          billingMode: 'byok',
          credits: 0,
          model: 'heygen-avatar',
        }),
      }),
    );
    avatarGeneration.generateAvatarVideo.mockImplementation(
      async (
        _params: unknown,
        _context: unknown,
        onPlaceholderCreated: (id: string) => Promise<void>,
        _scope: PlaceholderScope,
        onCreditsPrepared: (price: AvatarGenerationPrice) => Promise<void>,
      ) => {
        await onPlaceholderCreated('avatar-video-1');
        await onCreditsPrepared({ billingMode: 'platform', credits: 8 });
        providerCalls.push('paid-speech-and-video');
      },
    );

    await expect(service.dispatch(job)).resolves.toEqual({ status: 'failed' });
    expect(providerCalls).toEqual([]);
    expect(creditsUtils.reserveCredits).not.toHaveBeenCalled();
    expect(itemWrites()).toContainEqual(
      expect.objectContaining({
        error: expect.stringContaining('Avatar funding changed'),
        status: BatchProjectItemStatus.FAILED,
      }),
    );
  });

  it('refuses an image the generation priced as platform when the line is BYOK', async () => {
    useItem(
      makeItem('image', {
        dispatch: makeDispatch({ billingMode: 'byok', credits: 0 }),
      }),
    );
    imageGeneration.generateImage.mockImplementation(
      mediaGeneration({
        amount: 4,
        modelKey: 'model-image',
        reservationId: 'reservation-1',
      }),
    );

    await service.dispatch(job);

    expect(providerCalls).toEqual([]);
  });

  it.each([
    ['a newer attempt', { dispatch: makeDispatch({ key: 'other-key' }) }],
    [
      'an attempt already reserved',
      { dispatch: makeDispatch({ state: 'reserved' }) },
    ],
    ['an attempt already dispatched', { outputIngredientId: 'ingredient-1' }],
    ['a finished item', { status: BatchProjectItemStatus.READY }],
  ])('does nothing for %s', async (_label, overrides) => {
    useItem(makeItem('image', overrides));

    await expect(service.dispatch(job)).resolves.toEqual({
      status: 'skipped',
    });
    expect(imageGeneration.generateImage).not.toHaveBeenCalled();
    expect(creditsUtils.reserveCredits).not.toHaveBeenCalled();
  });

  it('releases the recorded hold when an attempt fails', async () => {
    useItem(
      makeItem('image', {
        dispatch: makeDispatch({
          reservationId: 'reservation-1',
          state: 'reserved',
        }),
      }),
    );

    await service.failItem(job, 'Provider rejected the prompt');

    expect(creditsUtils.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
      data: {
        dispatch: expect.objectContaining({ state: 'released' }),
        error: 'Provider rejected the prompt',
        status: BatchProjectItemStatus.FAILED,
      },
      where: expect.objectContaining({
        dispatch: { equals: job.key, path: ['key'] },
        id: 'item-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
  });

  it('queues one durable job per attempt with a failure workflow', async () => {
    await service.enqueue(job);

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'batch-project.idea.dispatch',
        inputValues: { job },
        organizationId: 'org-1',
      }),
      'batch-project-idea-item-1-1',
      expect.objectContaining({
        failureWorkflow: {
          canonicalId: 'batch-project.idea.dispatch.failure',
          inputValues: { job },
        },
      }),
    );
  });
});
