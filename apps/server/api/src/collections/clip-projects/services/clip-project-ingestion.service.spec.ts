import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import type { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import type { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipProjectIngestionService } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import type { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import { BadRequestException } from '@nestjs/common';

describe('ClipProjectIngestionService', () => {
  const currentUser = {
    id: 'legacy-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const completeIdentity: AgentClipRunIdentity = {
    avatarId: 'avatar-1',
    avatarProvider: 'heygen',
    isComplete: true,
    label: 'Explicit clip identity',
    missing: [],
    source: 'explicit',
    useIdentity: true,
    voiceId: 'voice-1',
    voiceProvider: 'heygen',
  };
  let service: ClipProjectIngestionService;
  let clipProjectsService: {
    create: ReturnType<typeof vi.fn>;
  };
  let clipFactoryQueueService: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipAnalyzeQueueService: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipGenerationRequestService: {
    assertCompleteAvatarIdentity: ReturnType<typeof vi.fn>;
    resolveRunReferences: ReturnType<typeof vi.fn>;
  };
  let clipIdentityResolutionService: {
    resolve: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    clipProjectsService = {
      create: vi.fn().mockResolvedValue({
        id: 'project-1',
      } as ClipProjectDocument),
    };
    clipFactoryQueueService = {
      enqueue: vi.fn().mockResolvedValue('factory-job-1'),
    };
    clipAnalyzeQueueService = {
      enqueue: vi.fn().mockResolvedValue('analyze-job-1'),
    };
    clipGenerationRequestService = {
      assertCompleteAvatarIdentity: vi.fn((identity?: AgentClipRunIdentity) => {
        if (identity && !identity.isComplete) {
          throw new BadRequestException(
            `${identity.label}. Configure saved brand defaults or provide explicit ${identity.missing.join(' and ')} IDs.`,
          );
        }
      }),
      resolveRunReferences: vi.fn().mockResolvedValue([]),
    };
    clipIdentityResolutionService = {
      resolve: vi.fn().mockResolvedValue(completeIdentity),
    };
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    service = new ClipProjectIngestionService(
      clipProjectsService as unknown as ClipProjectsService,
      clipFactoryQueueService as unknown as ClipFactoryQueueService,
      clipAnalyzeQueueService as unknown as ClipAnalyzeQueueService,
      clipGenerationRequestService as unknown as ClipGenerationRequestService,
      clipIdentityResolutionService as unknown as ClipIdentityResolutionService,
      creditsUtilsService as unknown as CreditsUtilsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates and queues an avatar project with custom values', async () => {
    const customIdentity: AgentClipRunIdentity = {
      ...completeIdentity,
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      voiceId: 'voice-custom',
      voiceProvider: 'argil',
    };
    clipIdentityResolutionService.resolve.mockResolvedValue(customIdentity);

    const result = await service.createFromYoutube(currentUser as never, {
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      language: 'fr',
      maxClips: 12,
      minViralityScore: 72,
      name: 'Custom factory project',
      voiceId: 'voice-custom',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      brandId: undefined,
      organizationId: 'org-1',
      voiceId: 'voice-custom',
    });
    expect(
      clipGenerationRequestService.assertCompleteAvatarIdentity,
    ).toHaveBeenCalledWith(customIdentity);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org-1', 12);
    expect(clipProjectsService.create).toHaveBeenCalledWith({
      brandId: undefined,
      language: 'fr',
      name: 'Custom factory project',
      organizationId: 'org-1',
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: 12,
        maxDuration: 90,
        minDuration: 15,
        mode: 'avatar',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      userId: 'user-1',
    });
    expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith({
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      language: 'fr',
      maxClips: 12,
      minViralityScore: 72,
      mode: 'avatar',
      orgId: 'org-1',
      projectId: 'project-1',
      runReferences: [],
      userId: 'user-1',
      voiceId: 'voice-custom',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(result).toEqual({
      batchJobId: 'factory-job-1',
      estimatedClips: 12,
      identity: customIdentity,
      projectId: 'project-1',
      status: 'processing',
    });
  });

  it('preserves brand defaults, run references, and default payload values', async () => {
    const brandIdentity = {
      ...completeIdentity,
      source: 'brand' as const,
    };
    const runReferences = [
      {
        assetId: 'product-1',
        description: 'Ceramic mug',
        role: 'product' as const,
        url: 'https://cdn.example.com/product.png',
      },
    ];
    clipIdentityResolutionService.resolve.mockResolvedValue(brandIdentity);
    clipGenerationRequestService.resolveRunReferences.mockResolvedValue(
      runReferences,
    );

    await service.createFromYoutube(currentUser as never, {
      brandId: 'brand-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: undefined,
      avatarProvider: undefined,
      brandId: 'brand-1',
      organizationId: 'org-1',
      voiceId: undefined,
    });
    expect(
      clipGenerationRequestService.resolveRunReferences,
    ).toHaveBeenCalledWith('brand-1', 'org-1');
    expect(clipProjectsService.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      language: 'en',
      name: 'YouTube Clip Factory — 2026-08-26',
      organizationId: 'org-1',
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: 10,
        maxDuration: 90,
        minDuration: 15,
        mode: 'avatar',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      userId: 'user-1',
    });
    expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith({
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      language: 'en',
      maxClips: 10,
      minViralityScore: 50,
      mode: 'avatar',
      orgId: 'org-1',
      projectId: 'project-1',
      runReferences,
      userId: 'user-1',
      voiceId: 'voice-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const referenceOrder =
      clipGenerationRequestService.resolveRunReferences.mock
        .invocationCallOrder[0];
    const creditOrder =
      creditsUtilsService.checkOrganizationCreditsAvailable.mock
        .invocationCallOrder[0];
    const createOrder = clipProjectsService.create.mock.invocationCallOrder[0];
    expect(referenceOrder ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      creditOrder ?? 0,
    );
    expect(creditOrder ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      createOrder ?? 0,
    );
  });

  it('queues raw-cut mode without resolving avatar identity', async () => {
    await expect(
      service.createFromYoutube(currentUser as never, {
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).resolves.toMatchObject({
      estimatedClips: 10,
      identity: undefined,
      status: 'processing',
    });

    expect(clipIdentityResolutionService.resolve).not.toHaveBeenCalled();
    expect(
      clipGenerationRequestService.assertCompleteAvatarIdentity,
    ).toHaveBeenCalledWith(undefined);
    expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        mode: 'raw-cut',
        voiceId: undefined,
      }),
    );
    expect(clipProjectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ mode: 'raw-cut' }),
      }),
    );
  });

  it('validates raw-cut brand ownership and resolves its run references', async () => {
    const runReferences = [
      {
        assetId: 'logo-1',
        role: 'style' as const,
        url: 'https://cdn.example.com/logo.png',
      },
    ];
    clipGenerationRequestService.resolveRunReferences.mockResolvedValue(
      runReferences,
    );

    const result = await service.createFromYoutube(currentUser as never, {
      brandId: 'brand-1',
      mode: 'raw-cut',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: undefined,
      avatarProvider: undefined,
      brandId: 'brand-1',
      organizationId: 'org-1',
      voiceId: undefined,
    });
    expect(
      clipGenerationRequestService.resolveRunReferences,
    ).toHaveBeenCalledWith('brand-1', 'org-1');
    expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        runReferences,
        voiceId: undefined,
      }),
    );
    expect(result.identity).toBeUndefined();
  });

  it('propagates foreign-brand rejection before credits, persistence, or queueing', async () => {
    const error = new Error('Brand not found');
    clipIdentityResolutionService.resolve.mockRejectedValue(error);

    await expect(
      service.createFromYoutube(currentUser as never, {
        brandId: 'foreign-brand',
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(error);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(clipProjectsService.create).not.toHaveBeenCalled();
    expect(clipFactoryQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('asserts complete avatar identity before credits or persistence', async () => {
    clipIdentityResolutionService.resolve.mockResolvedValue({
      ...completeIdentity,
      avatarId: undefined,
      isComplete: false,
      label: 'Missing avatar defaults',
      missing: ['avatar'],
      source: 'missing',
    });

    await expect(
      service.createFromYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toThrow(
      'Missing avatar defaults. Configure saved brand defaults or provide explicit avatar IDs.',
    );
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(clipProjectsService.create).not.toHaveBeenCalled();
    expect(clipFactoryQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('throws the exact balance error before persistence or queueing', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(3);
    let thrown: unknown;

    try {
      await service.createFromYoutube(currentUser as never, {
        avatarId: 'avatar-1',
        maxClips: 8,
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientCreditsException);
    expect(
      (thrown as InsufficientCreditsException).getResponse(),
    ).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      detail: 'Insufficient credits: 8 required, 3 available',
      meta: { available: 3, required: 8 },
    });
    expect(clipProjectsService.create).not.toHaveBeenCalled();
    expect(clipFactoryQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('propagates factory persistence and queue errors unchanged', async () => {
    const persistenceError = new Error('Project write failed');
    clipProjectsService.create.mockRejectedValueOnce(persistenceError);

    await expect(
      service.createFromYoutube(currentUser as never, {
        avatarId: 'avatar-1',
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(persistenceError);
    expect(clipFactoryQueueService.enqueue).not.toHaveBeenCalled();

    clipProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipProjectDocument);
    const queueError = new Error('Factory queue failed');
    clipFactoryQueueService.enqueue.mockRejectedValueOnce(queueError);

    await expect(
      service.createFromYoutube(currentUser as never, {
        avatarId: 'avatar-1',
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(queueError);
  });

  it('creates and queues analysis with custom values and tenant scope', async () => {
    const analysisIdentity = {
      ...completeIdentity,
      source: 'brand' as const,
    };
    clipIdentityResolutionService.resolve.mockResolvedValue(analysisIdentity);

    const result = await service.analyzeYoutube(currentUser as never, {
      brandId: 'brand-1',
      language: 'es',
      maxClips: 14,
      minViralityScore: 64,
      name: 'Custom analysis',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipIdentityResolutionService.resolve).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    expect(clipProjectsService.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      language: 'es',
      name: 'Custom analysis',
      organizationId: 'org-1',
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: 14,
        maxDuration: 90,
        minDuration: 15,
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'pending',
      userId: 'user-1',
    });
    expect(clipAnalyzeQueueService.enqueue).toHaveBeenCalledWith({
      language: 'es',
      maxClips: 14,
      minViralityScore: 64,
      orgId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(result).toEqual({
      identity: analysisIdentity,
      projectId: 'project-1',
      status: 'analyzing',
    });
  });

  it('preserves analysis defaults and the legacy user ID fallback', async () => {
    await service.analyzeYoutube(
      { id: 'legacy-user-1', organizationId: 'org-1' } as never,
      { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    );

    expect(clipProjectsService.create).toHaveBeenCalledWith({
      brandId: undefined,
      language: 'en',
      name: 'Clip Analysis — 2026-08-26',
      organizationId: 'org-1',
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: 10,
        maxDuration: 90,
        minDuration: 15,
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'pending',
      userId: 'legacy-user-1',
    });
    expect(clipAnalyzeQueueService.enqueue).toHaveBeenCalledWith({
      language: 'en',
      maxClips: 10,
      minViralityScore: 50,
      orgId: 'org-1',
      projectId: 'project-1',
      userId: 'legacy-user-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('propagates analysis identity, persistence, and queue errors unchanged', async () => {
    const identityError = new Error('Brand not found');
    clipIdentityResolutionService.resolve.mockRejectedValueOnce(identityError);

    await expect(
      service.analyzeYoutube(currentUser as never, {
        brandId: 'foreign-brand',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(identityError);
    expect(clipProjectsService.create).not.toHaveBeenCalled();
    expect(clipAnalyzeQueueService.enqueue).not.toHaveBeenCalled();

    const persistenceError = new Error('Analysis project write failed');
    clipProjectsService.create.mockRejectedValueOnce(persistenceError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(persistenceError);
    expect(clipAnalyzeQueueService.enqueue).not.toHaveBeenCalled();

    clipProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipProjectDocument);
    const queueError = new Error('Analyze queue failed');
    clipAnalyzeQueueService.enqueue.mockRejectedValueOnce(queueError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(queueError);
  });
});
