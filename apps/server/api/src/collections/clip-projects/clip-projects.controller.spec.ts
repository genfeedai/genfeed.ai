import { ClipProjectHandoffsController } from '@api/collections/clip-projects/clip-project-handoffs.controller';
import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import {
  type GenerateClipHighlightDto,
  GenerateClipsDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import { SelectClipReferenceFrameDto } from '@api/collections/clip-projects/dto/select-clip-reference-frame.dto';
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
import type { Request } from 'express';

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
  | 'create'
  | 'findOne'
  | 'patch'
  | 'reconcileTerminalState'
  | 'selectReferenceFrame'
> {
  return {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    reconcileTerminalState: vi.fn(),
    selectReferenceFrame: vi.fn(),
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
  let handoffsController: ClipProjectHandoffsController;
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
    );
    handoffsController = new ClipProjectHandoffsController(
      createMockLogger(),
      clipProjectsService as ClipProjectsService,
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
            mode: 'avatar',
          }),
          sourceVideoUrl: dto.youtubeUrl,
          user: expect.any(String),
        }),
      );
      expect(clipFactoryQueueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClips: 12,
          minViralityScore: 70,
          mode: 'avatar',
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

    it('should queue raw-cut projects without avatar credentials', async () => {
      const dto: CreateClipProjectFromYoutubeDto = {
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      };

      vi.mocked(clipProjectsService.create).mockResolvedValue({
        id: projectId,
      } as ClipProjectDocument);
      clipFactoryQueueService.enqueue.mockResolvedValue('clip-factory-job-1');

      await controller.createFromYoutube(currentUser as never, dto);

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
  });

  describe('selectReferenceFrame', () => {
    it('selects the candidate within the current organization scope', async () => {
      const selectedProject = {
        ...createProject(projectId, organizationId),
        referenceFrames: {
          candidates: [
            {
              diagnostics: [],
              id: 'frame-1',
              status: 'available',
              storageKey: 'organizations/org-1/clips/frame-1.jpg',
              timestampSeconds: 12,
            },
          ],
          diagnostics: [],
          schemaVersion: 1,
          selectedCandidateId: 'frame-1',
          status: 'selected',
        },
      } as ClipProjectDocument;
      vi.mocked(clipProjectsService.selectReferenceFrame).mockResolvedValue(
        selectedProject,
      );

      const result = await controller.selectReferenceFrame(
        {
          originalUrl: `/clip-projects/${projectId}/reference-frame`,
        } as Request,
        currentUser as never,
        projectId,
        { candidateId: 'frame-1' },
      );

      expect(clipProjectsService.selectReferenceFrame).toHaveBeenCalledWith(
        projectId,
        organizationId,
        'frame-1',
      );
      expect(result).toBeDefined();
    });

    it('trims candidate IDs and rejects blank values at the DTO boundary', () => {
      const validDto = plainToInstance(SelectClipReferenceFrameDto, {
        candidateId: ' frame-1 ',
      });
      const blankDto = plainToInstance(SelectClipReferenceFrameDto, {
        candidateId: '   ',
      });

      expect(validDto.candidateId).toBe('frame-1');
      expect(validateSync(validDto)).toEqual([]);
      expect(validateSync(blankDto).map((error) => error.property)).toContain(
        'candidateId',
      );
    });
  });

  describe('CreateClipProjectFromYoutubeDto validation', () => {
    it('should require avatar credentials when mode is omitted', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      const errors = validateSync(dto);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['avatarId', 'voiceId']),
      );
    });

    it('should accept raw-cut mode without avatar credentials', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(validateSync(dto)).toEqual([]);
    });

    it('should validate optional avatar credentials in raw-cut mode', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        avatarId: 123,
        mode: 'raw-cut',
        voiceId: false,
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      const errors = validateSync(dto);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['avatarId', 'voiceId']),
      );
    });

    it('should reject unknown generation modes', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        mode: 'unknown',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(validateSync(dto).map((error) => error.property)).toContain(
        'mode',
      );
    });

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

    it.each(['did', 'tavus', 'musetalk'] as const)(
      'should reject unsupported avatar provider %s',
      (avatarProvider) => {
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
      },
    );
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

    it('should require avatar credentials when mode is omitted', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        editedHighlights,
        selectedHighlightIds: ['highlight-1'],
      });

      const errors = validateSync(dto);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['avatarId', 'voiceId']),
      );
    });

    it('should accept raw-cut mode without avatar credentials', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        editedHighlights,
        mode: 'raw-cut',
        selectedHighlightIds: ['highlight-1'],
      });

      expect(validateSync(dto)).toEqual([]);
    });

    it('should validate optional avatar credentials in raw-cut mode', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        avatarId: 123,
        editedHighlights,
        mode: 'raw-cut',
        selectedHighlightIds: ['highlight-1'],
        voiceId: false,
      });

      const errors = validateSync(dto);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['avatarId', 'voiceId']),
      );
    });

    it('should reject unknown generation modes', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        editedHighlights,
        mode: 'unknown',
        selectedHighlightIds: ['highlight-1'],
      });

      expect(validateSync(dto).map((error) => error.property)).toContain(
        'mode',
      );
    });

    it.each(['did', 'tavus', 'musetalk'] as const)(
      'should reject unsupported avatar provider %s',
      (avatarProvider) => {
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
      },
    );
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
        settings: expect.objectContaining({ mode: 'avatar' }),
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
        mode: 'avatar',
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
        error: 'Clip generation failed before any generation job was queued.',
        progress: 100,
        status: 'failed',
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('should forward raw-cut mode and source context without avatar credentials', async () => {
    const project = {
      ...createProject(projectId, organizationId),
      sourceVideoS3Key: 'uploads/source.mp4',
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
      transcriptSegments: [
        { end: 45, start: 15, text: 'Original summary' },
        { end: 'invalid', start: 45, text: 'Ignored malformed segment' },
      ],
    } as ClipProjectDocument;
    const dto: GenerateClipsDto = {
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      mode: 'raw-cut',
      selectedHighlightIds: ['highlight-1'],
    };

    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipGenerationService.generateClips).mockResolvedValue({
      clipResultIds: ['clip-result-1'],
      providerJobIds: ['raw-cut-job-1'],
      queuedClipCount: 1,
    });

    await controller.generateClips(currentUser as never, projectId, dto);

    expect(clipGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        mode: 'raw-cut',
        sourceVideoS3Key: 'uploads/source.mp4',
        sourceVideoUrl: 'https://cdn.example.com/source.mp4',
        transcriptSegments: [{ end: 45, start: 15, text: 'Original summary' }],
        voiceId: undefined,
      }),
    );
  });

  it('should reject raw-cut generation when the project has no source video', async () => {
    const project = createProject(projectId, organizationId);
    const dto: GenerateClipsDto = {
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      mode: 'raw-cut',
      selectedHighlightIds: ['highlight-1'],
    };

    vi.mocked(clipProjectsService.findOne).mockResolvedValue(project);

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).rejects.toThrow('requires a source video');

    expect(clipProjectsService.patch).not.toHaveBeenCalled();
    expect(clipGenerationService.generateClips).not.toHaveBeenCalled();
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

    const result = await handoffsController.createEditorHandoff(
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

    const result = await handoffsController.createPublishHandoff(
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
      handoffsController.createPublishHandoff(
        currentUser as never,
        projectId,
        'clip-result-1',
      ),
    ).rejects.toThrow('not ready for publish handoff');
    expect(publishHandoffService.preparePublishHandoff).not.toHaveBeenCalled();
  });
});
