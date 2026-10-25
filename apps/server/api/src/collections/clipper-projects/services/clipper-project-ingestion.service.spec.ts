import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { MAX_CLIP_SOURCE_SIZE_BYTES } from '@api/collections/clipper-projects/dto/prepare-clipper-upload.dto';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { ClipperAnalysisWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow-queue.service';
import type { ClipperFactoryWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-factory-workflow-queue.service';
import type { ClipperGenerationRequestService } from '@api/collections/clipper-projects/services/clipper-generation-request.service';
import type { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperProjectIngestionService } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import type { AgentClipperRunIdentity } from '@genfeedai/contracts/interfaces';
import type { HttpService } from '@nestjs/axios';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('ClipperProjectIngestionService', () => {
  const currentUser = {
    id: 'legacy-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const completeIdentity: AgentClipperRunIdentity = {
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
  let service: ClipperProjectIngestionService;
  const http = { get: vi.fn() };
  let clipperProjectsService: {
    claimDraft: ReturnType<typeof vi.fn>;
    claimSourceRetry: ReturnType<typeof vi.fn>;
    releaseSourceRetry: ReturnType<typeof vi.fn>;
    markSourceDispatchFailed: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    patchDraft: ReturnType<typeof vi.fn>;
    releaseDraft: ReturnType<typeof vi.fn>;
  };
  let clipperFactoryWorkflowQueue: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipperAnalysisWorkflowQueue: {
    enqueue: ReturnType<typeof vi.fn>;
  };
  let clipperGenerationRequestService: {
    assertCompleteAvatarIdentity: ReturnType<typeof vi.fn>;
    assertProviderRequirements: ReturnType<typeof vi.fn>;
    resolveProjectReference: ReturnType<typeof vi.fn>;
    resolveRunReferences: ReturnType<typeof vi.fn>;
  };
  let clipperIdentityResolutionService: {
    resolve: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let presignedUploadService: {
    confirmUpload: ReturnType<typeof vi.fn>;
    getPresignedUploadUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    http.get
      .mockReset()
      .mockReturnValue(throwError(() => new Error('metadata unavailable')));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    clipperProjectsService = {
      claimDraft: vi.fn().mockResolvedValue(true),
      claimSourceRetry: vi.fn().mockResolvedValue(true),
      releaseSourceRetry: vi.fn().mockResolvedValue(undefined),
      markSourceDispatchFailed: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({
        id: 'project-1',
      } as ClipperProjectDocument),
      findOne: vi.fn(),
      patch: vi.fn(),
      patchDraft: vi.fn().mockResolvedValue({
        id: 'draft-1',
      } as ClipperProjectDocument),
      releaseDraft: vi.fn().mockResolvedValue(true),
    };
    clipperFactoryWorkflowQueue = {
      enqueue: vi.fn().mockResolvedValue('clipper-factory-project-1'),
    };
    clipperAnalysisWorkflowQueue = {
      enqueue: vi.fn().mockResolvedValue('clipper-analysis-project-1'),
    };
    clipperGenerationRequestService = {
      assertCompleteAvatarIdentity: vi.fn(
        (identity?: AgentClipperRunIdentity) => {
          if (identity && !identity.isComplete) {
            throw new BadRequestException(
              `${identity.label}. Configure saved brand defaults or provide explicit ${identity.missing.join(' and ')} IDs.`,
            );
          }
        },
      ),
      assertProviderRequirements: vi.fn(),
      resolveProjectReference: vi.fn().mockReturnValue({}),
      resolveRunReferences: vi.fn().mockResolvedValue([]),
    };
    clipperIdentityResolutionService = {
      resolve: vi.fn().mockResolvedValue(completeIdentity),
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
    service = new ClipperProjectIngestionService(
      clipperProjectsService as unknown as ClipperProjectsService,
      clipperFactoryWorkflowQueue as unknown as ClipperFactoryWorkflowQueueService,
      clipperAnalysisWorkflowQueue as unknown as ClipperAnalysisWorkflowQueueService,
      clipperGenerationRequestService as unknown as ClipperGenerationRequestService,
      clipperIdentityResolutionService as unknown as ClipperIdentityResolutionService,
      ingredientsService as unknown as IngredientsService,
      presignedUploadService as unknown as PresignedUploadService,
      http as unknown as HttpService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the actual YouTube title for an analysis project without submitting avatar generation', async () => {
    http.get.mockReturnValue(of({ data: { title: '  Source video title  ' } }));
    await service.analyzeYoutube(currentUser as never, {
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(http.get).toHaveBeenCalledWith('https://www.youtube.com/oembed', {
      params: {
        format: 'json',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      timeout: 5000,
    });
    expect(clipperProjectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Source video title',
        organizationId: 'org-1',
      }),
    );
    expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledOnce();
    expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not call a caller-supplied metadata host or create a project for an unsupported URL', async () => {
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://attacker.test/youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).rejects.toThrow('supported public YouTube');
    expect(http.get).not.toHaveBeenCalled();
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
  });

  it('creates and queues an avatar project with custom values', async () => {
    const customIdentity: AgentClipperRunIdentity = {
      ...completeIdentity,
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      voiceId: 'voice-custom',
      voiceProvider: 'argil',
    };
    clipperIdentityResolutionService.resolve.mockResolvedValue(customIdentity);

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

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: 'avatar-custom',
      avatarProvider: 'argil',
      brandId: undefined,
      organizationId: 'org-1',
      voiceId: 'voice-custom',
    });
    expect(
      clipperGenerationRequestService.assertCompleteAvatarIdentity,
    ).toHaveBeenCalledWith(customIdentity);
    expect(clipperProjectsService.create).toHaveBeenCalledWith({
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
    expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith({
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
    expect(clipperProjectsService.patch).toHaveBeenCalledWith(
      'project-1',
      {
        source: expect.objectContaining({
          jobId: 'clipper-factory-project-1',
        }),
      },
      [],
      'org-1',
    );
    expect(result).toEqual({
      batchJobId: 'clipper-factory-project-1',
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
    clipperIdentityResolutionService.resolve.mockResolvedValue(brandIdentity);
    clipperGenerationRequestService.resolveRunReferences.mockResolvedValue(
      runReferences,
    );

    await service.createFromYoutube(currentUser as never, {
      brandId: 'brand-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: undefined,
      avatarProvider: undefined,
      brandId: 'brand-1',
      organizationId: 'org-1',
      voiceId: undefined,
    });
    expect(
      clipperGenerationRequestService.resolveRunReferences,
    ).toHaveBeenCalledWith('brand-1', 'org-1');
    expect(clipperProjectsService.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      language: 'en',
      name: 'YouTube · dQw4w9WgXcQ',
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
    expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith({
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
      clipperGenerationRequestService.resolveRunReferences.mock
        .invocationCallOrder[0];
    const createOrder =
      clipperProjectsService.create.mock.invocationCallOrder[0];
    expect(referenceOrder ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
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

    expect(clipperIdentityResolutionService.resolve).not.toHaveBeenCalled();
    expect(
      clipperGenerationRequestService.assertCompleteAvatarIdentity,
    ).not.toHaveBeenCalled();
    expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        mode: 'raw-cut',
        voiceId: undefined,
      }),
    );
    expect(clipperProjectsService.create).toHaveBeenCalledWith(
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
    clipperGenerationRequestService.resolveRunReferences.mockResolvedValue(
      runReferences,
    );

    const result = await service.createFromYoutube(currentUser as never, {
      brandId: 'brand-1',
      mode: 'raw-cut',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: undefined,
      avatarProvider: undefined,
      brandId: 'brand-1',
      organizationId: 'org-1',
      voiceId: undefined,
    });
    expect(
      clipperGenerationRequestService.resolveRunReferences,
    ).toHaveBeenCalledWith('brand-1', 'org-1');
    expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        runReferences,
        voiceId: undefined,
      }),
    );
    expect(result.identity).toBeUndefined();
  });

  it('propagates foreign-brand rejection before persistence or queueing', async () => {
    const error = new Error('Brand not found');
    clipperIdentityResolutionService.resolve.mockRejectedValue(error);

    await expect(
      service.createFromYoutube(currentUser as never, {
        brandId: 'foreign-brand',
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(error);
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
    expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('asserts complete avatar identity before persistence', async () => {
    clipperIdentityResolutionService.resolve.mockResolvedValue({
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
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
    expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('propagates factory persistence and queue errors unchanged', async () => {
    const persistenceError = new Error('Project write failed');
    clipperProjectsService.create.mockRejectedValueOnce(persistenceError);

    await expect(
      service.createFromYoutube(currentUser as never, {
        avatarId: 'avatar-1',
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(persistenceError);
    expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();

    clipperProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipperProjectDocument);
    const queueError = new Error('Factory queue failed');
    clipperFactoryWorkflowQueue.enqueue.mockRejectedValueOnce(queueError);

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
    clipperIdentityResolutionService.resolve.mockResolvedValue(
      analysisIdentity,
    );

    const result = await service.analyzeYoutube(currentUser as never, {
      brandId: 'brand-1',
      language: 'es',
      maxClips: 14,
      minViralityScore: 64,
      name: 'Custom analysis',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    expect(clipperProjectsService.create).toHaveBeenCalledWith({
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
    expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith({
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

    expect(clipperProjectsService.create).toHaveBeenCalledWith({
      brandId: undefined,
      language: 'en',
      name: 'YouTube · dQw4w9WgXcQ',
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
    expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith({
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

    expect(presignedUploadService.getPresignedUploadUrl).toHaveBeenCalledWith(
      currentUser,
      expect.objectContaining({
        contentType: 'video/mp4',
        sizeBytes: 4_000_000_000,
      }),
      { maxBytes: MAX_CLIP_SOURCE_SIZE_BYTES },
    );
    expect(clipperProjectsService.create).toHaveBeenCalledWith(
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
      JSON.stringify(clipperProjectsService.create.mock.calls[0]),
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
    clipperProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      language: 'en',
      organizationId: 'org-1',
      settings: { flow: 'review', maxClips: 6, minViralityScore: 55 },
      source,
      sourceVideoS3Key: 'videos/ingredient-1',
      sourceVideoUrl: 'https://cdn.test/videos/ingredient-1',
    } as ClipperProjectDocument);
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
      service.finalizeUpload(currentUser as never, 'project-1', 'ingredient-1'),
    ).resolves.toMatchObject({
      batchJobId: 'clipper-analysis-project-1',
      estimatedClips: 6,
      status: 'analyzing',
    });

    expect(presignedUploadService.confirmUpload).toHaveBeenCalledWith(
      currentUser,
      'ingredient-1',
      { maxBytes: MAX_CLIP_SOURCE_SIZE_BYTES },
    );
    expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        source: expect.objectContaining({
          durationSeconds: 3600,
          jobId: 'clipper-analysis-project-1',
          status: 'queued',
        }),
        youtubeUrl: 'https://cdn.test/videos/ingredient-1',
      }),
    );
  });

  it('rejects authoritative upload metadata that exceeds the source policy', async () => {
    clipperProjectsService.findOne.mockResolvedValue({
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
    } as ClipperProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600, size: 11 * 1024 * 1024 * 1024 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1', 'ingredient-1'),
    ).rejects.toThrow('Clip sources may be up to 10 GB.');
    expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not trust the client-declared upload size when storage metadata omits it', async () => {
    clipperProjectsService.findOne.mockResolvedValue({
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
    } as ClipperProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1', 'ingredient-1'),
    ).rejects.toThrow('uploaded clip source size is unavailable');
    expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('requires authoritative duration metadata before queueing an upload', async () => {
    clipperProjectsService.findOne.mockResolvedValue({
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
    } as ClipperProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { size: 4_000_000_000 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await expect(
      service.finalizeUpload(currentUser as never, 'project-1', 'ingredient-1'),
    ).rejects.toThrow('uploaded clip source duration is unavailable');
    expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
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
    clipperGenerationRequestService.resolveProjectReference.mockReturnValue(
      reference,
    );
    clipperProjectsService.findOne.mockResolvedValue({
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
    } as ClipperProjectDocument);
    ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      metadata: { duration: 3600, size: 4_000_000_000 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    });

    await service.finalizeUpload(
      currentUser as never,
      'project-1',
      'ingredient-1',
    );

    expect(
      clipperGenerationRequestService.resolveProjectReference,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'avatar', provider: 'genfeedai' }),
    );
    expect(
      clipperGenerationRequestService.assertProviderRequirements,
    ).toHaveBeenCalledWith('genfeedai', reference, [], 'avatar');
    expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: 'https://cdn.test/reference.jpg',
      }),
    );
  });

  it('retries only the failed deterministic source job', async () => {
    clipperProjectsService.findOne.mockResolvedValue({
      id: 'project-1',
      organizationId: 'org-1',
      settings: { flow: 'review', maxClips: 6 },
      sourceVideoUrl: 'https://youtube.com/watch?v=abc123def45',
      source: {
        fingerprint: 'sha256:test',
        flow: 'review',
        jobId: 'clipper-analysis-project-1',
        kind: 'youtube',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        status: 'failed',
        updatedAt: '2026-08-26T12:00:00.000Z',
      },
    } as ClipperProjectDocument);

    await expect(
      service.retrySource(currentUser as never, 'project-1'),
    ).resolves.toMatchObject({
      batchJobId: 'clipper-analysis-project-1',
      status: 'queued',
    });

    expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        source: expect.objectContaining({ retryCount: 1, status: 'queued' }),
      }),
    );
    expect(clipperProjectsService.claimSourceRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' }),
      'org-1',
      expect.objectContaining({ retryCount: 1, status: 'queued' }),
    );
    expect(
      clipperProjectsService.claimSourceRetry.mock.invocationCallOrder[0],
    ).toBeLessThan(
      clipperAnalysisWorkflowQueue.enqueue.mock.invocationCallOrder[0] ?? 0,
    );
    expect(clipperProjectsService.patch).not.toHaveBeenCalled();
  });

  it.each(['collision', 'dispatch failure'] as const)(
    'keeps source retry admission consistent on %s',
    async (failure) => {
      const project = {
        id: 'project-1',
        status: 'failed',
        organizationId: 'org-1',
        settings: { flow: 'review' },
        sourceVideoUrl: 'https://youtu.be/abc123def45',
        source: {
          fingerprint: 'sha256:source',
          flow: 'review',
          jobId: 'clipper-analysis-project-1',
          kind: 'youtube',
          maxRetries: 3,
          retryCount: 0,
          schemaVersion: 1,
          status: 'failed',
        },
      };
      clipperProjectsService.findOne.mockResolvedValue(project);
      if (failure === 'collision')
        clipperProjectsService.claimSourceRetry.mockResolvedValue(false);
      else
        clipperAnalysisWorkflowQueue.enqueue.mockRejectedValue(
          new Error('Queue unavailable'),
        );
      await expect(
        service.retrySource(currentUser as never, 'project-1'),
      ).rejects.toThrow(
        failure === 'collision' ? 'already retried' : 'Queue unavailable',
      );
      if (failure === 'collision') {
        expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
        expect(
          clipperProjectsService.releaseSourceRetry,
        ).not.toHaveBeenCalled();
      } else {
        expect(clipperProjectsService.releaseSourceRetry).toHaveBeenCalledWith(
          project,
          'org-1',
          1,
        );
      }
    },
  );

  it('marks an imported YouTube source recoverable when initial dispatch fails', async () => {
    clipperAnalysisWorkflowQueue.enqueue.mockRejectedValue(
      new Error('Queue unavailable'),
    );
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/abc123def45',
      }),
    ).rejects.toThrow('Queue unavailable');
    expect(
      clipperProjectsService.markSourceDispatchFailed,
    ).toHaveBeenCalledWith(
      'project-1',
      'org-1',
      expect.objectContaining({
        jobId: 'clipper-analysis-project-1',
        retryCount: 0,
      }),
    );
  });

  it('refuses an upload prepared for a brand outside the organization', async () => {
    const brandError = new Error('Brand not found');
    clipperIdentityResolutionService.resolve.mockRejectedValueOnce(brandError);

    await expect(
      service.prepareUpload(currentUser as never, {
        brandId: 'foreign-brand',
        contentType: 'video/mp4',
        filename: 'talk.mp4',
        sizeBytes: 1_000,
      }),
    ).rejects.toBe(brandError);
    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      brandId: 'foreign-brand',
      organizationId: 'org-1',
    });
    expect(presignedUploadService.getPresignedUploadUrl).not.toHaveBeenCalled();
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
    expect(clipperProjectsService.patchDraft).not.toHaveBeenCalled();
  });

  it('accepts audio for analysis without requiring avatar generation defaults', async () => {
    await service.prepareUpload(currentUser as never, {
      contentType: 'audio/mpeg',
      filename: 'podcast.mp3',
      flow: 'review',
      mode: 'raw-cut',
      sizeBytes: 10_000,
    });
    expect(presignedUploadService.getPresignedUploadUrl).toHaveBeenCalledOnce();
    expect(clipperProjectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ flow: 'review' }),
        source: expect.objectContaining({
          kind: 'upload',
          contentType: 'audio/mpeg',
        }),
      }),
    );
    expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
    expect(clipperIdentityResolutionService.resolve).not.toHaveBeenCalled();
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
    clipperIdentityResolutionService.resolve.mockRejectedValueOnce(
      identityError,
    );

    await expect(
      service.analyzeYoutube(currentUser as never, {
        brandId: 'foreign-brand',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(identityError);
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
    expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();

    const persistenceError = new Error('Analysis project write failed');
    clipperProjectsService.create.mockRejectedValueOnce(persistenceError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(persistenceError);
    expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();

    clipperProjectsService.create.mockResolvedValueOnce({
      id: 'project-2',
    } as ClipperProjectDocument);
    const queueError = new Error('Analyze queue failed');
    clipperAnalysisWorkflowQueue.enqueue.mockRejectedValueOnce(queueError);
    await expect(
      service.analyzeYoutube(currentUser as never, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(queueError);
  });

  describe('draft projects', () => {
    it('creates an org-scoped draft with default form settings', async () => {
      await service.createDraft(currentUser as never, { brandId: 'brand-1' });

      expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });
      expect(clipperProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          draft: {
            sourceKind: 'youtube',
            updatedAt: '2026-08-26T12:00:00.000Z',
          },
          organizationId: 'org-1',
          settings: expect.objectContaining({
            maxClips: 10,
            minViralityScore: 50,
          }),
          status: 'draft',
          userId: 'user-1',
        }),
      );
      expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });

    it('starts analysis on the claimed draft instead of creating a project', async () => {
      clipperProjectsService.patch.mockResolvedValue({
        id: 'draft-1',
      } as ClipperProjectDocument);

      await expect(
        service.analyzeYoutube(currentUser as never, {
          draftProjectId: 'draft-1',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      ).resolves.toMatchObject({ projectId: 'draft-1', status: 'analyzing' });

      expect(clipperProjectsService.claimDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
        undefined,
      );
      expect(clipperProjectsService.create).not.toHaveBeenCalled();
      expect(clipperProjectsService.patch).toHaveBeenNthCalledWith(
        1,
        'draft-1',
        expect.objectContaining({
          sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          status: 'pending',
        }),
        [],
        'org-1',
      );
      expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'draft-1' }),
      );
    });

    it('starts a quick run on the claimed draft', async () => {
      clipperProjectsService.patch.mockResolvedValue({
        id: 'draft-1',
      } as ClipperProjectDocument);

      await service.createFromYoutube(currentUser as never, {
        draftProjectId: 'draft-1',
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(clipperProjectsService.claimDraft).toHaveBeenCalledOnce();
      expect(clipperProjectsService.create).not.toHaveBeenCalled();
      expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'draft-1' }),
      );
    });

    it('keeps an upload draft resumable until the upload is finalized', async () => {
      clipperProjectsService.findOne.mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
      } as ClipperProjectDocument);
      const prepare = () =>
        service.prepareUpload(currentUser as never, {
          contentType: 'video/mp4',
          draftProjectId: 'draft-1',
          filename: 'podcast.mp4',
          sizeBytes: 100,
        });

      // The first transfer fails client-side; preparing again must still work.
      await expect(prepare()).resolves.toMatchObject({ projectId: 'draft-1' });
      await expect(prepare()).resolves.toMatchObject({ projectId: 'draft-1' });

      expect(clipperProjectsService.claimDraft).not.toHaveBeenCalled();
      expect(clipperProjectsService.create).not.toHaveBeenCalled();
      expect(clipperProjectsService.patchDraft).toHaveBeenCalledTimes(2);
      expect(clipperProjectsService.patchDraft).toHaveBeenLastCalledWith(
        'draft-1',
        'org-1',
        expect.objectContaining({
          source: expect.objectContaining({
            filename: 'podcast.mp4',
            kind: 'upload',
            status: 'uploading',
          }),
          sourceVideoS3Key: 'videos/ingredient-1',
        }),
      );
    });

    it('claims an upload draft when its upload is finalized', async () => {
      clipperProjectsService.findOne.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        settings: { flow: 'review', maxClips: 4 },
        source: {
          contentType: 'video/mp4',
          filename: 'podcast.mp4',
          flow: 'review',
          ingredientId: 'ingredient-1',
          kind: 'upload',
          maxRetries: 3,
          retryCount: 0,
          schemaVersion: 1,
          status: 'uploading',
        },
        sourceVideoUrl: 'https://cdn.test/videos/ingredient-1',
        status: 'draft',
      } as ClipperProjectDocument);
      ingredientsService.findOne.mockResolvedValue({
        id: 'ingredient-1',
        metadata: { duration: 600, size: 1_000 },
        mimeType: 'video/mp4',
        status: 'UPLOADED',
      });

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).resolves.toMatchObject({ status: 'analyzing' });

      expect(clipperProjectsService.claimDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
        undefined,
      );
      expect(
        clipperProjectsService.claimDraft.mock.invocationCallOrder[0],
      ).toBeLessThan(
        clipperAnalysisWorkflowQueue.enqueue.mock.invocationCallOrder[0] ?? 0,
      );
      expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'draft-1' }),
      );
      expect(clipperProjectsService.releaseDraft).not.toHaveBeenCalled();
    });

    const quickUploadDraft = {
      id: 'draft-1',
      organizationId: 'org-1',
      settings: { flow: 'quick', maxClips: 4, mode: 'raw-cut' },
      source: {
        contentType: 'video/mp4',
        filename: 'podcast.mp4',
        flow: 'quick',
        ingredientId: 'ingredient-1',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        status: 'uploading',
      },
      sourceVideoUrl: 'https://cdn.test/videos/ingredient-1',
      status: 'draft',
    } as ClipperProjectDocument;
    const uploadedIngredient = {
      id: 'ingredient-1',
      metadata: { duration: 600, size: 1_000 },
      mimeType: 'video/mp4',
      status: 'UPLOADED',
    };

    it('refuses to start a draft whose upload changed after validation', async () => {
      const validated = {
        ...quickUploadDraft,
        sourceVideoS3Key: 'videos/upload-a',
        updatedAt: new Date('2026-09-28T10:00:00.000Z'),
      } as ClipperProjectDocument;
      clipperProjectsService.findOne
        .mockResolvedValueOnce(validated)
        .mockResolvedValueOnce({
          ...validated,
          sourceVideoS3Key: 'videos/upload-b',
          updatedAt: new Date('2026-09-28T10:00:01.000Z'),
        } as ClipperProjectDocument);
      ingredientsService.findOne.mockResolvedValue(uploadedIngredient);
      clipperProjectsService.claimDraft.mockResolvedValue(false);

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).rejects.toThrow("This draft's source or settings changed");

      expect(clipperProjectsService.claimDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
        validated.updatedAt,
      );
      expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });

    it('retries the claim when only an autosave touched the draft', async () => {
      const validated = {
        ...quickUploadDraft,
        updatedAt: new Date('2026-09-28T10:00:00.000Z'),
      } as ClipperProjectDocument;
      const autosaved = {
        ...validated,
        updatedAt: new Date('2026-09-28T10:00:01.000Z'),
      } as ClipperProjectDocument;
      clipperProjectsService.findOne
        .mockResolvedValueOnce(validated)
        .mockResolvedValueOnce(autosaved);
      ingredientsService.findOne.mockResolvedValue(uploadedIngredient);
      clipperProjectsService.claimDraft
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).resolves.toMatchObject({ status: 'processing' });

      expect(clipperProjectsService.claimDraft).toHaveBeenLastCalledWith(
        'draft-1',
        'org-1',
        autosaved.updatedAt,
      );
      expect(clipperFactoryWorkflowQueue.enqueue).toHaveBeenCalledOnce();
    });

    it('keeps the saved draft brand when a YouTube start omits it', async () => {
      clipperProjectsService.findOne.mockResolvedValue({
        brandId: 'brand-9',
        id: 'draft-1',
        status: 'draft',
      } as ClipperProjectDocument);
      clipperProjectsService.patch.mockResolvedValue({
        id: 'draft-1',
      } as ClipperProjectDocument);

      await service.analyzeYoutube(currentUser as never, {
        draftProjectId: 'draft-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
        brandId: 'brand-9',
        organizationId: 'org-1',
      });
      expect(clipperProjectsService.patch).toHaveBeenNthCalledWith(
        1,
        'draft-1',
        expect.objectContaining({ brandId: 'brand-9' }),
        [],
        'org-1',
      );
      const startPatch = clipperProjectsService.patch.mock.calls[0]?.[1];
      expect(
        Object.values(startPatch as Record<string, unknown>),
      ).not.toContain(undefined);
    });

    it('checks the draft before creating an upload record for it', async () => {
      clipperProjectsService.findOne.mockResolvedValue({
        id: 'draft-1',
        status: 'analyzing',
      } as ClipperProjectDocument);

      await expect(
        service.prepareUpload(currentUser as never, {
          contentType: 'video/mp4',
          draftProjectId: 'draft-1',
          filename: 'podcast.mp4',
          sizeBytes: 100,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        presignedUploadService.getPresignedUploadUrl,
      ).not.toHaveBeenCalled();
    });

    it('refuses to dispatch settings changed after validation', async () => {
      const validated = {
        ...quickUploadDraft,
        updatedAt: new Date('2026-09-28T10:00:00.000Z'),
      } as ClipperProjectDocument;
      clipperProjectsService.findOne
        .mockResolvedValueOnce(validated)
        .mockResolvedValueOnce({
          ...validated,
          settings: { ...validated.settings, maxClips: 30 },
          updatedAt: new Date('2026-09-28T10:00:01.000Z'),
        } as ClipperProjectDocument);
      ingredientsService.findOne.mockResolvedValue(uploadedIngredient);
      clipperProjectsService.claimDraft.mockResolvedValue(false);

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).rejects.toThrow('source or settings changed');
      expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });

    it('refuses a finalize for an upload another tab has since replaced', async () => {
      clipperProjectsService.findOne.mockResolvedValue({
        ...quickUploadDraft,
        source: { ...quickUploadDraft.source, ingredientId: 'ingredient-2' },
      } as ClipperProjectDocument);

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).rejects.toThrow('This upload was replaced by a newer one');

      expect(ingredientsService.findOne).not.toHaveBeenCalled();
      expect(clipperProjectsService.claimDraft).not.toHaveBeenCalled();
      expect(clipperFactoryWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns a claimed draft to draft when dispatch fails', async () => {
      clipperProjectsService.findOne.mockResolvedValue(quickUploadDraft);
      ingredientsService.findOne.mockResolvedValue(uploadedIngredient);
      const queueError = new Error('queue unavailable');
      clipperFactoryWorkflowQueue.enqueue.mockRejectedValue(queueError);

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).rejects.toBe(queueError);

      expect(clipperProjectsService.claimDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
        undefined,
      );
      expect(clipperProjectsService.releaseDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
      );
    });

    it('returns a claimed YouTube draft to draft when analysis cannot be queued', async () => {
      clipperProjectsService.patch.mockResolvedValue({
        id: 'draft-1',
      } as ClipperProjectDocument);
      clipperAnalysisWorkflowQueue.enqueue.mockRejectedValue(
        new Error('queue unavailable'),
      );

      await expect(
        service.analyzeYoutube(currentUser as never, {
          draftProjectId: 'draft-1',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      ).rejects.toThrow('queue unavailable');
      expect(clipperProjectsService.releaseDraft).toHaveBeenCalledWith(
        'draft-1',
        'org-1',
      );
    });

    it('does not release a project it did not start from a draft', async () => {
      clipperAnalysisWorkflowQueue.enqueue.mockRejectedValue(
        new Error('queue unavailable'),
      );

      await expect(
        service.analyzeYoutube(currentUser as never, {
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      ).rejects.toThrow('queue unavailable');
      expect(clipperProjectsService.releaseDraft).not.toHaveBeenCalled();
    });

    it('does not queue a finalized upload whose draft another start claimed', async () => {
      clipperProjectsService.claimDraft.mockResolvedValue(false);
      clipperProjectsService.findOne.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        settings: { flow: 'review' },
        source: {
          contentType: 'video/mp4',
          flow: 'review',
          ingredientId: 'ingredient-1',
          kind: 'upload',
          maxRetries: 3,
          retryCount: 0,
          schemaVersion: 1,
          status: 'uploading',
        },
        sourceVideoUrl: 'https://cdn.test/videos/ingredient-1',
        status: 'draft',
      } as ClipperProjectDocument);
      ingredientsService.findOne.mockResolvedValue({
        id: 'ingredient-1',
        metadata: { duration: 600, size: 1_000 },
        mimeType: 'video/mp4',
        status: 'UPLOADED',
      });

      await expect(
        service.finalizeUpload(currentUser as never, 'draft-1', 'ingredient-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });

    it('refuses a draft that was already started without queueing twice', async () => {
      clipperProjectsService.claimDraft.mockResolvedValue(false);

      await expect(
        service.analyzeYoutube(currentUser as never, {
          draftProjectId: 'draft-1',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(clipperProjectsService.patch).not.toHaveBeenCalled();
      expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
    });
  });
});
