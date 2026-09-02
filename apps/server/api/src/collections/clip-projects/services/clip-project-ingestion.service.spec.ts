import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import type { ClipAnalysisWorkflowQueueService } from '@api/collections/clip-projects/services/clip-analysis-workflow-queue.service';
import type { ClipFactoryWorkflowQueueService } from '@api/collections/clip-projects/services/clip-factory-workflow-queue.service';
import type { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import type { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipProjectIngestionService } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import type { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
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
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let clipFactoryWorkflowQueue: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipAnalysisWorkflowQueue: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipGenerationRequestService: {
    assertCompleteAvatarIdentity: ReturnType<typeof vi.fn>;
    assertProviderRequirements: ReturnType<typeof vi.fn>;
    resolveProjectReference: ReturnType<typeof vi.fn>;
    resolveRunReferences: ReturnType<typeof vi.fn>;
  };
  let clipIdentityResolutionService: {
    resolve: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let presignedUploadService: {
    confirmUpload: ReturnType<typeof vi.fn>;
    getPresignedUploadUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    clipProjectsService = {
      create: vi.fn().mockResolvedValue({
        id: 'project-1',
      } as ClipProjectDocument),
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    clipFactoryWorkflowQueue = {
      enqueue: vi.fn().mockResolvedValue('clip-factory-project-1'),
    };
    clipAnalysisWorkflowQueue = {
      enqueue: vi.fn().mockResolvedValue('clip-analysis-project-1'),
    };
    clipGenerationRequestService = {
      assertCompleteAvatarIdentity: vi.fn((identity?: AgentClipRunIdentity) => {
        if (identity && !identity.isComplete) {
          throw new BadRequestException(
            `${identity.label}. Configure saved brand defaults or provide explicit ${identity.missing.join(' and ')} IDs.`,
          );
        }
      }),
      assertProviderRequirements: vi.fn(),
      resolveProjectReference: vi.fn().mockReturnValue({}),
      resolveRunReferences: vi.fn().mockResolvedValue([]),
    };
    clipIdentityResolutionService = {
      resolve: vi.fn().mockResolvedValue(completeIdentity),
    };
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    ingredientsService = { findOne: vi.fn() };
    presignedUploadService = {
      confirmUpload: vi.fn(),
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        expiresIn: 3600,
        id: 'ingredient-1',
        publicUrl: 'https://cdn.test/videos/ingredient-1',
        s3Key: 'videos/ingredient-1',
        uploadUrl: 'https://uploads.test/ingredient-1',
      }),
    };
    service = new ClipProjectIngestionService(
      clipProjectsService as unknown as ClipProjectsService,
      clipFactoryWorkflowQueue as unknown as ClipFactoryWorkflowQueueService,
      clipAnalysisWorkflowQueue as unknown as ClipAnalysisWorkflowQueueService,
      clipGenerationRequestService as unknown as ClipGenerationRequestService,
      clipIdentityResolutionService as unknown as ClipIdentityResolutionService,
      creditsUtilsService as unknown as CreditsUtilsService,
      ingredientsService as unknown as IngredientsService,
      presignedUploadService as unknown as PresignedUploadService,
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
        avatarId: 'avatar-custom',
        avatarProvider: 'argil',
        captionStyle: 'default',
        flow: 'quick',
        language: 'fr',
        maxClips: 12,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: 72,
        mode: 'avatar',
        voiceId: 'voice-custom',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'quick', kind: 'youtube' }),
      userId: 'user-1',
    });
    expect(clipFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith({
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
      source: expect.objectContaining({ flow: 'quick', kind: 'youtube' }),
    });
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      'project-1',
      {
        source: expect.objectContaining({
          jobId: 'clip-factory-project-1',
        }),
      },
      [],
      'org-1',
    );
    expect(result).toEqual({
      batchJobId: 'clip-factory-project-1',
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
        avatarId: 'avatar-1',
        avatarProvider: 'heygen',
        captionStyle: 'default',
        flow: 'quick',
        language: 'en',
        maxClips: 10,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: 50,
        mode: 'avatar',
        voiceId: 'voice-1',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'quick', kind: 'youtube' }),
      userId: 'user-1',
    });
    expect(clipFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith({
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
      source: expect.objectContaining({ flow: 'quick', kind: 'youtube' }),
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
    ).not.toHaveBeenCalled();
    expect(clipFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
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
    expect(clipFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
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
    expect(clipFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
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
    expect(clipFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
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
    expect(clipFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
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
    expect(clipFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();

    clipProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipProjectDocument);
    const queueError = new Error('Factory queue failed');
    clipFactoryWorkflowQueue.enqueue.mockRejectedValueOnce(queueError);

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
        flow: 'review',
        language: 'es',
        maxClips: 14,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: 64,
        mode: 'avatar',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'review', kind: 'youtube' }),
      status: 'pending',
      userId: 'user-1',
    });
    expect(clipAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith({
      language: 'es',
      maxClips: 14,
      minViralityScore: 64,
      orgId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'review', kind: 'youtube' }),
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
        flow: 'review',
        language: 'en',
        maxClips: 10,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: 50,
        mode: 'avatar',
      },
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'review', kind: 'youtube' }),
      status: 'pending',
      userId: 'legacy-user-1',
    });
    expect(clipAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith({
      language: 'en',
      maxClips: 10,
      minViralityScore: 50,
      orgId: 'org-1',
      projectId: 'project-1',
      userId: 'legacy-user-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      source: expect.objectContaining({ flow: 'review', kind: 'youtube' }),
    });
  });

  it('prepares a durable video upload without persisting upload credentials', async () => {
    const result = await service.prepareUpload(currentUser as never, {
      contentType: 'video/mp4',
      filename: 'three-hour-podcast.mp4',
      flow: 'review',
      sizeBytes: 4_000_000_000,
    });

    expect(clipProjectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        source: expect.objectContaining({
          contentType: 'video/mp4',
          flow: 'review',
          ingredientId: 'ingredient-1',
          kind: 'upload',
          status: 'uploading',
        }),
      }),
    );
    expect(
      JSON.stringify(clipProjectsService.create.mock.calls[0]),
    ).not.toContain('uploads.test');
    expect(result).toMatchObject({
      ingredientId: 'ingredient-1',
      projectId: 'project-1',
      uploadUrl: 'https://uploads.test/ingredient-1',
    });
  });

  it('confirms authoritative upload metadata and queues the configured review flow', async () => {
    const source = {
      artifact: {
        contentType: 'video/mp4',
        mediaUrl: 'https://cdn.test/videos/ingredient-1',
        storageKey: 'videos/ingredient-1',
      },
      contentType: 'video/mp4',
      filename: 'podcast.mp4',
      fingerprint: 'sha256:test',
      flow: 'review' as const,
      ingredientId: 'ingredient-1',
      kind: 'upload' as const,
      maxRetries: 3,
      retryCount: 0,
      schemaVersion: 1 as const,
      sizeBytes: 100,
      status: 'uploading' as const,
      updatedAt: '2026-08-26T12:00:00.000Z',
    };
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      language: 'en',
      organizationId: 'org-1',
      settings: { flow: 'review', maxClips: 6, minViralityScore: 55 },
      source,
      sourceVideoS3Key: 'videos/ingredient-1',
      sourceVideoUrl: 'https://cdn.test/videos/ingredient-1',
    } as ClipProjectDocument);
    ingredientsService.findOne
      .mockResolvedValueOnce({
        id: 'ingredient-1',
        metadata: {},
        status: 'PROCESSING',
      })
      .mockResolvedValueOnce({
        id: 'ingredient-1',
        metadata: { duration: 3600, size: 4_000_000_000 },
        mimeType: 'video/mp4',
        status: 'UPLOADED',
      });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1'),
    ).resolves.toMatchObject({
      batchJobId: 'clip-analysis-project-1',
      estimatedClips: 6,
      status: 'analyzing',
    });

    expect(presignedUploadService.confirmUpload).toHaveBeenCalledWith(
      currentUser,
      'ingredient-1',
    );
    expect(clipAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        source: expect.objectContaining({
          durationSeconds: 3600,
          jobId: 'clip-analysis-project-1',
          status: 'queued',
        }),
        youtubeUrl: 'https://cdn.test/videos/ingredient-1',
      }),
    );
  });

  it('rejects authoritative upload metadata that exceeds the source policy', async () => {
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: { flow: 'review' },
      source: {
        contentType: 'video/mp4',
        filename: 'oversized.mp4',
        flow: 'review',
        ingredientId: 'ingredient-1',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        sizeBytes: 100,
        status: 'uploading',
      },
    } as ClipProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600, size: 11 * 1024 * 1024 * 1024 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1'),
    ).rejects.toThrow('Clip sources may be up to 10 GB.');
    expect(clipAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not trust the client-declared upload size when storage metadata omits it', async () => {
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: { flow: 'review' },
      source: {
        contentType: 'video/mp4',
        filename: 'source.mp4',
        flow: 'review',
        ingredientId: 'ingredient-1',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        sizeBytes: 100,
        status: 'uploading',
      },
    } as ClipProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1'),
    ).rejects.toThrow('uploaded clip source size is unavailable');
    expect(clipAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('requires authoritative duration metadata before queueing an upload', async () => {
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: { flow: 'review' },
      source: {
        contentType: 'video/mp4',
        filename: 'source.mp4',
        flow: 'review',
        ingredientId: 'ingredient-1',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        sizeBytes: 100,
        status: 'uploading',
      },
    } as ClipProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { size: 4_000_000_000 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1'),
    ).rejects.toThrow('uploaded clip source duration is unavailable');
    expect(clipAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('validates a managed upload against its selected project reference', async () => {
    const reference = {
      application: {
        mode: 'avatar',
        nativeField: 'imageUrl',
        provider: 'genfeedai',
        state: 'applied',
      },
      referenceImageUrl: 'https://cdn.test/reference.jpg',
    };
    clipGenerationRequestService.resolveProjectReference.mockReturnValue(
      reference,
    );
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: {
        avatarProvider: 'genfeedai',
        flow: 'quick',
        mode: 'avatar',
      },
      source: {
        artifact: {
          contentType: 'video/mp4',
          mediaUrl: 'https://cdn.test/source.mp4',
          storageKey: 'videos/source.mp4',
        },
        contentType: 'video/mp4',
        filename: 'source.mp4',
        flow: 'quick',
        ingredientId: 'ingredient-1',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        sizeBytes: 100,
        status: 'uploading',
      },
    } as ClipProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600, size: 4_000_000_000 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await service.finalizeUpload(currentUser as never, 'project-1');

    expect(
      clipGenerationRequestService.resolveProjectReference,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'avatar', provider: 'genfeedai' }),
    );
    expect(
      clipGenerationRequestService.assertProviderRequirements,
    ).toHaveBeenCalledWith('genfeedai', reference, [], 'avatar');
    expect(clipFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: 'https://cdn.test/reference.jpg',
      }),
    );
  });

  it('retries only the failed deterministic source job', async () => {
    clipProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: { flow: 'review', maxClips: 6 },
      sourceVideoUrl: 'https://youtube.com/watch?v=abc123def45',
      source: {
        fingerprint: 'sha256:test',
        flow: 'review',
        jobId: 'clip-analysis-project-1',
        kind: 'youtube',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        status: 'failed',
        updatedAt: '2026-08-26T12:00:00.000Z',
      },
    } as ClipProjectDocument);

    await expect(
      service.retrySource(currentUser as never, 'project-1'),
    ).resolves.toMatchObject({
      batchJobId: 'clip-analysis-project-1',
      status: 'queued',
    });

    expect(clipAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        source: expect.objectContaining({ retryCount: 1, status: 'queued' }),
      }),
    );
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ error: null, status: 'pending' }),
      [],
      'org-1',
    );
  });

  it('rejects raw-cut generation for an audio-only upload', async () => {
    await expect(
      service.prepareUpload(currentUser as never, {
        contentType: 'audio/mpeg',
        filename: 'podcast.mp3',
        mode: 'raw-cut',
        sizeBytes: 10_000,
      }),
    ).rejects.toThrow('Audio sources require avatar mode');
    expect(presignedUploadService.getPresignedUploadUrl).not.toHaveBeenCalled();
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
    expect(clipAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();

    const persistenceError = new Error('Analysis project write failed');
    clipProjectsService.create.mockRejectedValueOnce(persistenceError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(persistenceError);
    expect(clipAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();

    clipProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipProjectDocument);
    const queueError = new Error('Analyze queue failed');
    clipAnalysisWorkflowQueue.enqueue.mockRejectedValueOnce(queueError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(queueError);
  });
});
