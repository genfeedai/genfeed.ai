import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import {
  type GenerateClipHighlightDto,
  GenerateClipsDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import type { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import type { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import type { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import type { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockClipProjectsService(): Pick<
  ClipProjectsService,
  'create' | 'findOne' | 'patch' | 'reconcileTerminalState'
> {
  return {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    reconcileTerminalState: vi.fn(),
  };
}

function createMockClipGenerationService(): Pick<
  ClipGenerationService,
  'generateClips'
> {
  return {
    generateClips: vi.fn(),
  };
}

function createProject(
  projectId: string,
  organizationId: string,
): ClipProjectDocument {
  return {
    highlights: [
      {
        clip_type: 'hook',
        end_time: 45,
        id: 'highlight-1',
        start_time: 15,
        summary: 'Original summary',
        tags: ['viral'],
        title: 'Original title',
        virality_score: 85,
      },
    ],
    id: projectId,
    isDeleted: false,
    organization: organizationId,
    status: 'analyzed',
    transcriptText: 'Original title. Original summary',
  } as unknown as ClipProjectDocument;
}

describe('ClipProjectsController', () => {
  const organizationId = '507f191e810c19729de860ee'.toString();
  const projectId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();
  const currentUser = {
    publicMetadata: {
      organization: organizationId,
      user: userId,
    },
  };

  let controller: ClipProjectsController;
  let clipProjectsService: ReturnType<typeof createMockClipProjectsService>;
  let clipGenerationService: ReturnType<typeof createMockClipGenerationService>;
  let clipFactoryQueueService: { enqueue: ReturnType<typeof vi.fn> };
  let clipResultsService: {
    findProjectResultForHandoff: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let editorProjectsService: { create: ReturnType<typeof vi.fn> };
  let publishHandoffService: {
    preparePublishHandoff: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipProjectsService = createMockClipProjectsService();
    clipGenerationService = createMockClipGenerationService();
    clipFactoryQueueService = {
      enqueue: vi.fn(),
    };
    clipResultsService = {
      findProjectResultForHandoff: vi.fn(),
    };
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    editorProjectsService = {
      create: vi.fn(),
    };
    publishHandoffService = {
      preparePublishHandoff: vi.fn(),
    };

    controller = new ClipProjectsController(
      createMockLogger(),
      clipProjectsService as ClipProjectsService,
      clipFactoryQueueService as unknown as ClipFactoryQueueService,
      { enqueue: vi.fn() } as unknown as ClipAnalyzeQueueService,
      clipGenerationService as ClipGenerationService,
      { rewrite: vi.fn() } as unknown as HighlightRewriteService,
      creditsUtilsService as unknown as CreditsUtilsService,
      clipResultsService as unknown as ClipResultsService,
      editorProjectsService as unknown as EditorProjectsService,
      publishHandoffService as unknown as PublishHandoffService,
    );
  });

  describe('createFromYoutube', () => {
    it('should return batchJobId and estimatedClips when the project is queued', async () => {
      const dto: CreateClipProjectFromYoutubeDto = {
        avatarId: 'avatar-1',
        maxClips: 12,
        minViralityScore: 70,
        voiceId: 'voice-1',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      vi.mocked(clipProjectsService.create).mockResolvedValue({
        id: projectId,
      } as ClipProjectDocument);
      clipFactoryQueueService.enqueue.mockResolvedValue('clip-factory-job-1');

      const result = await controller.createFromYoutube(
        currentUser as never,
        dto,
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(organizationId, 12);
      expect(clipProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: expect.any(String),
          settings: expect.objectContaining({
            maxClips: 12,
          }),
          sourceVideoUrl: dto.youtubeUrl,
          user: expect.any(String),
        }),
      );
      expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClips: 12,
          minViralityScore: 70,
          projectId,
          youtubeUrl: dto.youtubeUrl,
        }),
      );
      expect(result).toEqual({
        batchJobId: 'clip-factory-job-1',
        estimatedClips: 12,
        projectId,
        status: 'processing',
      });
    });

    it('should reject before creating the project when credits are insufficient', async () => {
      const dto: CreateClipProjectFromYoutubeDto = {
        avatarId: 'avatar-1',
        maxClips: 8,
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      };

      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(3);

      await expect(
        controller.createFromYoutube(currentUser as never, dto),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);
      expect(clipProjectsService.create).not.toHaveBeenCalled();
      expect(clipFactoryQueueService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('CreateClipProjectFromYoutubeDto validation', () => {
    it('should reject non-youtube URLs', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        avatarId: 'avatar-1',
        voiceId: 'voice-1',
        youtubeUrl: 'https://example.com/not-youtube',
      });

      const errors = validateSync(dto);
      const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );

      expect(messages).toContain('Must be a valid YouTube URL');
    });

    it.each([
      'did',
      'tavus',
      'musetalk',
    ] as const)('should reject unsupported avatar provider %s', (avatarProvider) => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        avatarId: 'avatar-1',
        avatarProvider,
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      const errors = validateSync(dto);
      const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );

      expect(messages).toContain(
        'avatarProvider must be one of the following values: heygen',
      );
    });
  });

  describe('GenerateClipsDto validation', () => {
    const editedHighlights: GenerateClipHighlightDto[] = [
      {
        id: 'highlight-1',
        summary: 'Edited summary',
        title: 'Edited title',
      },
    ];

    it('should accept the production-ready HeyGen avatar provider', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        avatarId: 'avatar-1',
        avatarProvider: 'heygen',
        editedHighlights,
        selectedHighlightIds: ['highlight-1'],
        voiceId: 'voice-1',
      });

      expect(validateSync(dto)).toEqual([]);
    });

    it.each([
      'did',
      'tavus',
      'musetalk',
    ] as const)('should reject unsupported avatar provider %s', (avatarProvider) => {
      const dto = plainToInstance(GenerateClipsDto, {
        avatarId: 'avatar-1',
        avatarProvider,
        editedHighlights,
        selectedHighlightIds: ['highlight-1'],
        voiceId: 'voice-1',
      });

      const errors = validateSync(dto);
      const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );

      expect(messages).toContain(
        'avatarProvider must be one of the following values: heygen',
      );
    });
  });

  it('should persist edited highlights and keep the project generating while jobs are queued', async () => {
    const project = createProject(projectId, organizationId);
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary that should be generated',
          title: 'Edited title',
        },
      ],
      selectedHighlightIds: ['highlight-1'],
      voiceId: 'voice-1',
    };

    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipGenerationService.generateClips).mockResolvedValue({
      clipResultIds: ['clip-result-1'],
      providerJobIds: ['provider-job-1'],
      queuedClipCount: 1,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipProjectsService.patch).toHaveBeenNthCalledWith(
      1,
      projectId,
      expect.objectContaining({
        highlights: [
          expect.objectContaining({
            id: 'highlight-1',
            summary: 'Edited summary that should be generated',
            title: 'Edited title',
          }),
        ],
        progress: 0,
        status: 'generating',
      }),
    );
    expect(clipGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: [
          expect.objectContaining({
            summary: 'Edited summary that should be generated',
            title: 'Edited title',
          }),
        ],
      }),
    );
    expect(clipProjectsService.patch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      clipCount: 1,
      clipResultIds: ['clip-result-1'],
      status: 'generating',
    });
  });

  it('should mark the project failed when every provider job fails before queueing', async () => {
    const project = createProject(projectId, organizationId);
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary that should be generated',
          title: 'Edited title',
        },
      ],
      selectedHighlightIds: ['highlight-1'],
      voiceId: 'voice-1',
    };

    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipGenerationService.generateClips).mockResolvedValue({
      clipResultIds: ['clip-result-1'],
      providerJobIds: [''],
      queuedClipCount: 0,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipProjectsService.patch).toHaveBeenNthCalledWith(
      2,
      projectId,
      expect.objectContaining({
        error: 'Clip generation failed before any provider job was queued.',
        progress: 100,
        status: 'failed',
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('creates an editor handoff for a ready clip result', async () => {
    const project = createProject(projectId, organizationId);
    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.reconcileTerminalState).mockResolvedValue(
      project,
    );
    clipResultsService.findProjectResultForHandoff.mockResolvedValue({
      duration: 12,
      id: 'clip-result-1',
      readiness: {
        blockingReasons: [],
        readyActions: ['download', 'edit', 'publish'],
        state: 'ready',
        terminal: true,
      },
      status: 'completed',
      title: 'Launch clip',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });
    editorProjectsService.create.mockResolvedValue({
      id: 'editor-project-1',
    });

    const result = await controller.createEditorHandoff(
      currentUser as never,
      projectId,
      'clip-result-1',
    );

    expect(clipResultsService.findProjectResultForHandoff).toHaveBeenCalledWith(
      {
        clipResultId: 'clip-result-1',
        organizationId,
        projectId,
      },
    );
    expect(editorProjectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        tracks: [
          expect.objectContaining({
            clips: [
              expect.objectContaining({
                ingredientUrl: 'https://cdn.genfeed.ai/clip.mp4',
              }),
            ],
          }),
        ],
        userId,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        editorPath: '/editor/editor-project-1',
        editorProjectId: 'editor-project-1',
      }),
    );
  });

  it('prepares publish handoff for a ready clip result', async () => {
    const project = createProject(projectId, organizationId);
    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.reconcileTerminalState).mockResolvedValue(
      project,
    );
    clipResultsService.findProjectResultForHandoff.mockResolvedValue({
      id: 'clip-result-1',
      readiness: {
        blockingReasons: [],
        readyActions: ['download', 'edit', 'publish'],
        state: 'ready',
        terminal: true,
      },
      status: 'completed',
      summary: 'Clip summary',
      title: 'Launch clip',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });
    publishHandoffService.preparePublishHandoff.mockResolvedValue({
      assets: [
        {
          assetId: 'clip-result-1',
          mediaUrl: 'https://cdn.genfeed.ai/clip.mp4',
          mimeType: 'video/mp4',
        },
      ],
      clipProjectId: projectId,
      confirmBeforePublish: true,
      platforms: ['instagram'],
      preparedAt: '2026-06-30T00:00:00.000Z',
      schedule: 'immediate',
    });

    const result = await controller.createPublishHandoff(
      currentUser as never,
      projectId,
      'clip-result-1',
    );

    expect(publishHandoffService.preparePublishHandoff).toHaveBeenCalledWith(
      projectId,
      ['clip-result-1'],
      expect.objectContaining({
        assets: {
          'clip-result-1': expect.objectContaining({
            caption: 'Clip summary',
            mediaUrl: 'https://cdn.genfeed.ai/clip.mp4',
          }),
        },
      }),
    );
    expect(result.payload).toEqual(
      expect.objectContaining({
        confirmBeforePublish: true,
      }),
    );
  });

  it('rejects handoff when readiness metadata does not allow the action', async () => {
    const project = createProject(projectId, organizationId);
    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.reconcileTerminalState).mockResolvedValue(
      project,
    );
    clipResultsService.findProjectResultForHandoff.mockResolvedValue({
      id: 'clip-result-1',
      readiness: {
        blockingReasons: [],
        readyActions: ['download'],
        state: 'ready',
        terminal: true,
      },
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });

    await expect(
      controller.createPublishHandoff(
        currentUser as never,
        projectId,
        'clip-result-1',
      ),
    ).rejects.toThrow('not ready for publish handoff');
    expect(publishHandoffService.preparePublishHandoff).not.toHaveBeenCalled();
  });
});
