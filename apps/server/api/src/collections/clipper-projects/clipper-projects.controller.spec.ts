import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { ClipperProjectGenerationController } from '@api/collections/clipper-projects/clipper-project-generation.controller';
import { ClipperProjectHandoffsController } from '@api/collections/clipper-projects/clipper-project-handoffs.controller';
import { ClipperProjectReferenceFramesController } from '@api/collections/clipper-projects/clipper-project-reference-frames.controller';
import { ClipperProjectsController } from '@api/collections/clipper-projects/clipper-projects.controller';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { CreateClipperProjectDto } from '@api/collections/clipper-projects/dto/create-clipper-project.dto';
import {
  type GenerateClipperHighlightDto,
  GenerateClipsDto,
  SubmitHookClipDecisionDto,
} from '@api/collections/clipper-projects/dto/generate-clips.dto';
import { SelectClipperReferenceFrameDto } from '@api/collections/clipper-projects/dto/select-clipper-reference-frame.dto';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
import { ClipperGenerationDispatchService } from '@api/collections/clipper-projects/services/clipper-generation-dispatch.service';
import { ClipperGenerationRequestService } from '@api/collections/clipper-projects/services/clipper-generation-request.service';
import type { ClipperHandoffWorkflowService } from '@api/collections/clipper-projects/services/clipper-handoff-workflow.service';
import type {
  ClipperIdentityResolutionService,
  ResolveClipperIdentityParams,
} from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperProjectClientSourceService } from '@api/collections/clipper-projects/services/clipper-project-client-source.service';
import type { HookClipApprovalService } from '@api/collections/clipper-projects/services/hook-clipper-approval.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AgentClipperRunIdentity,
  AgentClipperRunIdentityField,
} from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
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

function createMockClipperProjectsService(): Pick<
  ClipperProjectsService,
  | 'create'
  | 'claimFailedResultRetry'
  | 'findOne'
  | 'patch'
  | 'reconcileTerminalState'
  | 'selectReferenceFrame'
> {
  return {
    claimFailedResultRetry: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    reconcileTerminalState: vi.fn(),
    selectReferenceFrame: vi.fn(),
  };
}

function createMockClipperGenerationService(): Pick<
  ClipperGenerationService,
  'generateClips'
> {
  return {
    generateClips: vi.fn(),
  };
}

function createMockClipperIdentityResolutionService(): Pick<
  ClipperIdentityResolutionService,
  'resolve'
> {
  return {
    resolve: vi
      .fn()
      .mockImplementation(
        async ({
          avatarId,
          voiceId,
        }: ResolveClipperIdentityParams): Promise<AgentClipperRunIdentity> => {
          const missing: AgentClipperRunIdentityField[] = [];

          if (!avatarId) {
            missing.push('avatar');
          }

          if (!voiceId) {
            missing.push('voice');
          }

          return {
            avatarId,
            avatarProvider: avatarId ? 'heygen' : undefined,
            isComplete: missing.length === 0,
            label:
              missing.length === 0
                ? 'Explicit clip identity'
                : `Missing ${missing.join(' and ')} defaults`,
            missing,
            source: avatarId || voiceId ? 'explicit' : 'missing',
            useIdentity: true,
            voiceId,
            voiceProvider: voiceId ? 'heygen' : undefined,
          };
        },
      ),
  };
}

function createProject(
  projectId: string,
  organizationId: string,
): ClipperProjectDocument {
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
    organizationId,
    status: 'analyzed',
    transcriptText: 'Original title. Original summary',
  } as unknown as ClipperProjectDocument;
}

function withSelectedReference(
  project: ClipperProjectDocument,
): ClipperProjectDocument {
  return {
    ...project,
    referenceFrames: {
      candidates: [
        {
          assetId: 'asset-frame-1',
          diagnostics: [],
          id: 'frame-1',
          mimeType: 'image/jpeg',
          status: 'available',
          storageKey:
            'ingredients/images/organizations/org-1/clips/project-1/frame-1.jpg',
          timestampSeconds: 12.5,
          url: 'https://cdn.example.com/frame-1.jpg',
        },
      ],
      diagnostics: [],
      schemaVersion: 1,
      selectedCandidateId: 'frame-1',
      status: 'selected',
    },
  } as ClipperProjectDocument;
}

describe('ClipperProjectsController', () => {
  const organizationId = testId('org');
  const projectId = testId('project');
  const userId = testId('user');
  const currentUser = {
    organizationId: organizationId,
    userId: userId,
  };

  const sourceIngredient = { findFirst: vi.fn() };
  let controller: ClipperProjectGenerationController;
  let crudController: ClipperProjectsController;
  let handoffsController: ClipperProjectHandoffsController;
  let referenceFramesController: ClipperProjectReferenceFramesController;
  let clipperProjectsService: ReturnType<
    typeof createMockClipperProjectsService
  >;
  let clipperGenerationService: ReturnType<
    typeof createMockClipperGenerationService
  >;
  let brandsService: { resolveBrandKitAssets: ReturnType<typeof vi.fn> };
  let clipperIdentityResolutionService: ReturnType<
    typeof createMockClipperIdentityResolutionService
  >;
  let clipperResultsService: {
    findByProject: ReturnType<typeof vi.fn>;
    findProjectResultForHandoff: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let handoffWorkflowService: {
    createEditorHandoff: ReturnType<typeof vi.fn>;
    preparePublishHandoff: ReturnType<typeof vi.fn>;
    retryLibraryLink: ReturnType<typeof vi.fn>;
  };
  let hookClipApprovalService: {
    getStatus: ReturnType<typeof vi.fn>;
    isProjectReconciliationBlocked: ReturnType<typeof vi.fn>;
    submitDecision: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sourceIngredient.findFirst.mockReset().mockResolvedValue(null);
    clipperProjectsService = createMockClipperProjectsService();
    clipperGenerationService = createMockClipperGenerationService();
    clipperIdentityResolutionService =
      createMockClipperIdentityResolutionService();
    brandsService = {
      resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
    };
    clipperResultsService = {
      findByProject: vi.fn().mockResolvedValue([]),
      findProjectResultForHandoff: vi.fn(),
      patch: vi.fn(),
    };
    handoffWorkflowService = {
      createEditorHandoff: vi.fn(),
      preparePublishHandoff: vi.fn(),
      retryLibraryLink: vi.fn(),
    };
    hookClipApprovalService = {
      getStatus: vi.fn().mockResolvedValue({
        attempt: 0,
        remainingClipCount: 0,
        state: 'not_required',
      }),
      isProjectReconciliationBlocked: vi.fn().mockReturnValue(false),
      submitDecision: vi.fn(),
    };

    const clipperGenerationRequestService = new ClipperGenerationRequestService(
      clipperProjectsService as ClipperProjectsService,
      clipperIdentityResolutionService as ClipperIdentityResolutionService,
      brandsService as unknown as BrandsService,
    );
    controller = new ClipperProjectGenerationController(
      createMockLogger(),
      new ClipperGenerationDispatchService(
        clipperProjectsService as ClipperProjectsService,
        clipperGenerationService as ClipperGenerationService,
        clipperGenerationRequestService,
        clipperIdentityResolutionService as ClipperIdentityResolutionService,
        clipperResultsService as unknown as ClipperResultsService,
      ),
      hookClipApprovalService as unknown as HookClipApprovalService,
    );
    crudController = new ClipperProjectsController(
      createMockLogger(),
      clipperProjectsService as ClipperProjectsService,
      clipperIdentityResolutionService as ClipperIdentityResolutionService,
      hookClipApprovalService as unknown as HookClipApprovalService,
      new ClipperProjectClientSourceService(
        { ingredient: sourceIngredient } as unknown as PrismaService,
        { cdnUrl: 'https://cdn.example.com' } as ConfigService,
      ),
    );
    handoffsController = new ClipperProjectHandoffsController(
      createMockLogger(),
      handoffWorkflowService as unknown as ClipperHandoffWorkflowService,
    );
    referenceFramesController = new ClipperProjectReferenceFramesController(
      createMockLogger(),
      clipperProjectsService as ClipperProjectsService,
    );
  });

  it('should validate generic clip project brand ownership before create', async () => {
    const brandId = testId('brand');
    const dto = {
      brandId,
      sourceVideoUrl: 'https://example.com/source.mp4',
    } as CreateClipperProjectDto;

    vi.mocked(clipperIdentityResolutionService.resolve).mockRejectedValue(
      new Error('Brand not found'),
    );

    await expect(
      crudController.create({} as never, currentUser as never, dto),
    ).rejects.toThrow('Brand not found');

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      brandId,
      organizationId,
    });
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      sourceVideoS3Key: 'ingredients/videos/foreign',
      sourceVideoUrl: 'https://cdn.example.com/ingredients/videos/foreign',
    },
    { sourceVideoUrl: 'https://cdn.example.com/ingredients/videos/foreign' },
    { sourceVideoUrl: 'https://provider.example.com/foreign.mp4' },
  ])('refuses a foreign source before generic create: %j', async (source) => {
    vi.mocked(clipperProjectsService.create).mockResolvedValue(
      createProject(projectId, organizationId),
    );
    await expect(
      crudController.create(
        {} as never,
        currentUser as never,
        source as CreateClipperProjectDto,
      ),
    ).rejects.toThrow(/owned Library video/);
    expect(clipperProjectsService.create).not.toHaveBeenCalled();
    expect(sourceIngredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId,
          category: 'VIDEO',
        }),
      }),
    );
  });

  it.each([
    { sourceVideoS3Key: 'ingredients/videos/foreign' },
    { sourceVideoUrl: 'https://cdn.example.com/ingredients/videos/foreign' },
    { sourceVideoS3Key: null },
    { sourceVideoUrl: null },
  ])(
    'refuses a foreign or cleared source before generic patch: %j',
    async (source) => {
      vi.mocked(clipperProjectsService.findOne).mockResolvedValue(
        createProject(projectId, organizationId),
      );
      vi.mocked(clipperProjectsService.patch).mockResolvedValue(
        createProject(projectId, organizationId),
      );
      await expect(
        crudController.update(
          {} as never,
          currentUser as never,
          projectId,
          source as never,
        ),
      ).rejects.toThrow();
      expect(clipperProjectsService.patch).not.toHaveBeenCalled();
    },
  );

  it('writes the owned canonical media pair instead of retaining a mismatched URL', async () => {
    sourceIngredient.findFirst.mockResolvedValue({
      s3Key: 'ingredients/videos/owned',
      metadata: null,
    });
    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(
      createProject(projectId, organizationId),
    );
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(
      createProject(projectId, organizationId),
    );
    await crudController.update({} as never, currentUser as never, projectId, {
      sourceVideoS3Key: 'ingredients/videos/owned',
    });
    expect(clipperProjectsService.patch).toHaveBeenCalledWith(
      projectId,
      {
        sourceVideoS3Key: 'ingredients/videos/owned',
        sourceVideoUrl: 'https://cdn.example.com/ingredients/videos/owned',
      },
      [],
      organizationId,
    );
  });

  it('clears the previous storage key when a source update resolves to owned keyless media', async () => {
    const sourceVideoUrl = 'https://provider.example.com/owned.mp4';
    sourceIngredient.findFirst.mockResolvedValue({
      s3Key: null,
      metadata: { result: sourceVideoUrl },
    });
    vi.mocked(clipperProjectsService.findOne).mockResolvedValue({
      ...createProject(projectId, organizationId),
      sourceVideoS3Key: 'ingredients/videos/previous',
    });
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(
      createProject(projectId, organizationId),
    );
    await crudController.update({} as never, currentUser as never, projectId, {
      sourceVideoUrl,
    });
    expect(clipperProjectsService.patch).toHaveBeenCalledWith(
      projectId,
      { sourceVideoS3Key: null, sourceVideoUrl },
      [],
      organizationId,
    );
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
      } as ClipperProjectDocument;
      vi.mocked(clipperProjectsService.selectReferenceFrame).mockResolvedValue(
        selectedProject,
      );

      const result = await referenceFramesController.selectReferenceFrame(
        {
          originalUrl: `/clipper-projects/${projectId}/reference-frame`,
        } as Request,
        currentUser as never,
        projectId,
        { candidateId: 'frame-1' },
      );

      expect(clipperProjectsService.selectReferenceFrame).toHaveBeenCalledWith(
        projectId,
        organizationId,
        'frame-1',
      );
      expect(result).toBeDefined();
    });

    it('trims candidate IDs and rejects blank values at the DTO boundary', () => {
      const validDto = plainToInstance(SelectClipperReferenceFrameDto, {
        candidateId: ' frame-1 ',
      });
      const blankDto = plainToInstance(SelectClipperReferenceFrameDto, {
        candidateId: '   ',
      });

      expect(validDto.candidateId).toBe('frame-1');
      expect(validateSync(validDto)).toEqual([]);
      expect(validateSync(blankDto).map((error) => error.property)).toContain(
        'candidateId',
      );
    });
  });

  describe('Hook approval DTO validation', () => {
    it('validates the optional hook approval switch', () => {
      const highlights = [
        { id: 'highlight-1', summary: 'Summary', title: 'Title' },
      ];
      const valid = plainToInstance(GenerateClipsDto, {
        editedHighlights: highlights,
        hookApprovalRequired: false,
        selectedHighlightIds: ['highlight-1'],
      });
      const invalid = plainToInstance(GenerateClipsDto, {
        editedHighlights: highlights,
        hookApprovalRequired: 'yes',
        selectedHighlightIds: ['highlight-1'],
      });

      expect(validateSync(valid)).toEqual([]);
      expect(validateSync(invalid).map((error) => error.property)).toContain(
        'hookApprovalRequired',
      );
    });

    it('requires feedback for request-changes and reject decisions', () => {
      const missingFeedback = plainToInstance(SubmitHookClipDecisionDto, {
        action: 'request_changes',
      });
      const approval = plainToInstance(SubmitHookClipDecisionDto, {
        action: 'approve',
      });

      expect(
        validateSync(missingFeedback).map((error) => error.property),
      ).toContain('feedback');
      expect(validateSync(approval)).toEqual([]);
    });
  });

  describe('GenerateClipsDto validation', () => {
    const editedHighlights: GenerateClipperHighlightDto[] = [
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

    it('should accept the production-ready Argil avatar provider', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        avatarId: 'argil-avatar-1',
        avatarProvider: 'argil',
        editedHighlights,
        selectedHighlightIds: ['highlight-1'],
        voiceId: 'argil-voice-1',
      });

      expect(validateSync(dto)).toEqual([]);
    });

    it('should allow the controller to resolve omitted avatar credentials', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        editedHighlights,
        selectedHighlightIds: ['highlight-1'],
      });

      expect(validateSync(dto)).toEqual([]);
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

    it('should reject unknown selected-reference policies', () => {
      const dto = plainToInstance(GenerateClipsDto, {
        editedHighlights,
        referencePolicy: 'best-effort',
        selectedHighlightIds: ['highlight-1'],
      });

      expect(validateSync(dto).map((error) => error.property)).toContain(
        'referencePolicy',
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
          'avatarProvider must be one of the following values: heygen, argil, genfeedai',
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

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: ['provider-job-1'],
      queuedClipCount: 1,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipperProjectsService.patch).toHaveBeenNthCalledWith(
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
      [],
      organizationId,
    );
    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
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
    expect(clipperProjectsService.patch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      clipCount: 1,
      clipperResultIds: ['clipper-result-1'],
      status: 'generating',
    });
  });

  it('dispatches managed GenfeedAI generation from a selected reference without vendor IDs', async () => {
    const project = withSelectedReference(
      createProject(projectId, organizationId),
    );
    const dto: GenerateClipsDto = {
      avatarProvider: 'genfeedai',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Managed summary',
          title: 'Managed title',
        },
      ],
      mode: 'avatar',
      selectedHighlightIds: ['highlight-1'],
    };
    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      completedClipCount: 1,
      providerJobIds: ['genfeedai-clip-clipper-result-1'],
      queuedClipCount: 1,
    });

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).resolves.toEqual(expect.objectContaining({ status: 'completed' }));

    expect(clipperIdentityResolutionService.resolve).not.toHaveBeenCalled();
    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: undefined,
        provider: 'genfeedai',
        referenceImageUrl: 'https://cdn.example.com/frame-1.jpg',
        voiceId: undefined,
      }),
    );
  });

  it('defaults multi-clip avatar generation to hook approval', async () => {
    const project = createProject(projectId, organizationId);
    const hook = project.highlights?.[0];
    if (!hook) {
      throw new Error('Expected hook fixture');
    }
    project.highlights?.push({
      ...hook,
      clip_type: 'body',
      id: 'highlight-2',
      title: 'Body',
    });
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      editedHighlights: [
        { id: 'highlight-1', summary: 'Hook', title: 'Hook' },
        { id: 'highlight-2', summary: 'Body', title: 'Body' },
      ],
      selectedHighlightIds: ['highlight-1', 'highlight-2'],
      voiceId: 'voice-1',
    };
    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['hook-result-1'],
      providerJobIds: ['hook-job-1'],
      queuedClipCount: 1,
    });

    await controller.generateClips(currentUser as never, projectId, dto);

    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({ hookApprovalRequired: true }),
    );
  });

  it('routes trusted hook decisions with tenant and canonical reviewer context', async () => {
    hookClipApprovalService.submitDecision.mockResolvedValue({
      attempt: 1,
      remainingClipCount: 2,
      state: 'approved',
    });

    const result = await controller.submitHookClipDecision(
      currentUser as never,
      projectId,
      { action: 'approve' },
    );

    expect(hookClipApprovalService.submitDecision).toHaveBeenCalledWith({
      action: 'approve',
      feedback: undefined,
      organizationId,
      projectId,
      userId,
    });
    expect(result.data.state).toBe('approved');
  });

  it('should resolve persisted brand defaults before reviewed generation', async () => {
    const brandId = testId('brand');
    const project = {
      ...createProject(projectId, organizationId),
      brandId,
    } as ClipperProjectDocument;
    const dto: GenerateClipsDto = {
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      selectedHighlightIds: ['highlight-1'],
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperIdentityResolutionService.resolve).mockResolvedValue({
      avatarId: 'saved-avatar-2',
      avatarProvider: 'heygen',
      isComplete: true,
      label: 'Brand clip defaults',
      missing: [],
      source: 'brand',
      useIdentity: true,
      voiceId: 'saved-voice-2',
      voiceProvider: 'heygen',
    });
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-2'],
      providerJobIds: ['provider-job-2'],
      queuedClipCount: 1,
    });

    await controller.generateClips(currentUser as never, projectId, dto);

    expect(clipperIdentityResolutionService.resolve).toHaveBeenCalledWith({
      avatarId: undefined,
      avatarProvider: undefined,
      brandId,
      organizationId,
      voiceId: undefined,
    });
    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: 'saved-avatar-2',
        voiceId: 'saved-voice-2',
      }),
    );
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

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: [''],
      queuedClipCount: 0,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipperProjectsService.patch).toHaveBeenNthCalledWith(
      2,
      projectId,
      expect.objectContaining({
        error: 'Clip generation failed before any generation job was queued.',
        progress: 100,
        status: 'failed',
      }),
      [],
      organizationId,
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
    } as ClipperProjectDocument;
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

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: ['raw-cut-job-1'],
      queuedClipCount: 1,
    });

    await controller.generateClips(currentUser as never, projectId, dto);

    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
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

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).rejects.toThrow('requires a source video');

    expect(clipperProjectsService.patch).not.toHaveBeenCalled();
    expect(clipperGenerationService.generateClips).not.toHaveBeenCalled();
  });

  it('resolves and forwards the tenant-authorized selected reference for HeyGen', async () => {
    const project = withSelectedReference(
      createProject(projectId, organizationId),
    );
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      referencePolicy: 'strict',
      selectedHighlightIds: ['highlight-1'],
      voiceId: 'voice-1',
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: ['provider-job-1'],
      queuedClipCount: 1,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipperProjectsService.findOne).toHaveBeenCalledWith({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: 'https://cdn.example.com/frame-1.jpg',
        referenceProvenance: expect.objectContaining({
          application: expect.objectContaining({
            nativeField: 'photo_url',
            state: 'applied',
          }),
          source: expect.objectContaining({
            candidateId: 'frame-1',
            storageKey:
              'ingredients/images/organizations/org-1/clips/project-1/frame-1.jpg',
          }),
        }),
      }),
    );
    expect(result.reference).toEqual(
      expect.objectContaining({ state: 'applied' }),
    );
    expect(JSON.stringify(result.reference)).not.toContain('cdn.example.com');
  });

  it('blocks an unsupported strict reference before credits or dispatch', async () => {
    const project = withSelectedReference({
      ...createProject(projectId, organizationId),
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    } as ClipperProjectDocument);
    const dto: GenerateClipsDto = {
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      mode: 'raw-cut',
      referencePolicy: 'strict',
      selectedHighlightIds: ['highlight-1'],
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).rejects.toThrow(/cannot apply a separate reference image/);

    expect(clipperProjectsService.patch).not.toHaveBeenCalled();
    expect(clipperGenerationService.generateClips).not.toHaveBeenCalled();
  });

  it('blocks unsafe selected media before credits or provider dispatch', async () => {
    const project = withSelectedReference(
      createProject(projectId, organizationId),
    );
    if (project.referenceFrames?.candidates[0]) {
      project.referenceFrames.candidates[0].url =
        'https://cdn.example.com/frame.jpg?X-Amz-Signature=secret';
    }
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      referencePolicy: 'strict',
      selectedHighlightIds: ['highlight-1'],
      voiceId: 'voice-1',
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).rejects.toThrow(/unsafe or transient image URL/);

    expect(clipperProjectsService.patch).not.toHaveBeenCalled();
    expect(clipperGenerationService.generateClips).not.toHaveBeenCalled();
  });

  it('exposes and persists an explicit degradation for guided raw-cut generation', async () => {
    const project = withSelectedReference({
      ...createProject(projectId, organizationId),
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    } as ClipperProjectDocument);
    const dto: GenerateClipsDto = {
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      mode: 'raw-cut',
      referencePolicy: 'guided',
      selectedHighlightIds: ['highlight-1'],
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: ['raw-cut-job-1'],
      queuedClipCount: 1,
    });

    const result = await controller.generateClips(
      currentUser as never,
      projectId,
      dto,
    );

    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceProvenance: expect.objectContaining({
          application: expect.objectContaining({
            reason: expect.stringContaining('cannot apply'),
            state: 'degraded',
          }),
        }),
      }),
    );
    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.not.objectContaining({ referenceImageUrl: expect.anything() }),
    );
    expect(result.reference).toEqual(
      expect.objectContaining({
        reason: expect.stringContaining('cannot apply'),
        state: 'degraded',
      }),
    );
  });

  it('does not resolve a reference across tenant boundaries', async () => {
    const dto: GenerateClipsDto = {
      avatarId: 'avatar-1',
      editedHighlights: [
        {
          id: 'highlight-1',
          summary: 'Edited summary',
          title: 'Edited title',
        },
      ],
      referencePolicy: 'strict',
      selectedHighlightIds: ['highlight-1'],
      voiceId: 'voice-1',
    };

    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(null);

    await expect(
      controller.generateClips(currentUser as never, projectId, dto),
    ).rejects.toThrow('ClipperProject');

    expect(clipperProjectsService.findOne).toHaveBeenCalledWith({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    expect(clipperGenerationService.generateClips).not.toHaveBeenCalled();
  });

  it('retries failed clips without replacing completed results', async () => {
    const project = {
      ...createProject(projectId, organizationId),
      settings: { mode: 'raw-cut' as const },
      sourceVideoS3Key: 'videos/source.mp4',
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
      status: 'partially-completed',
    } as ClipperProjectDocument;
    vi.mocked(clipperProjectsService.findOne).mockResolvedValue(project);
    vi.mocked(clipperProjectsService.patch).mockResolvedValue(project);
    clipperResultsService.findByProject.mockResolvedValue([
      {
        clipType: 'hook',
        endTime: 45,
        id: 'failed-result-1',
        startTime: 15,
        status: 'failed',
        summary: 'Retry this clip',
        tags: ['hook'],
        title: 'Failed hook',
        viralityScore: 85,
      },
      { id: 'completed-result-1', status: 'completed' },
    ]);
    vi.mocked(clipperGenerationService.generateClips).mockResolvedValue({
      clipperResultIds: ['replacement-result-1'],
      providerJobIds: ['raw-cut-retry-1'],
      queuedClipCount: 1,
    });

    await expect(
      controller.retryFailedClips(currentUser as never, projectId),
    ).resolves.toEqual(
      expect.objectContaining({ clipCount: 1, status: 'generating' }),
    );

    expect(clipperGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: [
          expect.objectContaining({
            end_time: 45,
            start_time: 15,
            title: 'Failed hook',
          }),
        ],
        sourceVideoS3Key: 'videos/source.mp4',
      }),
    );
    expect(clipperProjectsService.claimFailedResultRetry).toHaveBeenCalledWith(
      projectId,
      organizationId,
      1,
    );
    expect(clipperResultsService.patch).toHaveBeenCalledWith(
      'failed-result-1',
      { isDeleted: true },
      [],
      organizationId,
    );
    expect(clipperResultsService.patch).not.toHaveBeenCalledWith(
      'completed-result-1',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('creates an editor handoff for a ready clip result', async () => {
    handoffWorkflowService.createEditorHandoff.mockResolvedValue({
      clipperProjectId: projectId,
      clipperResultId: 'clipper-result-1',
      editorPath: '/editor/editor-project-1',
      editorProjectId: 'editor-project-1',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });

    const result = await handoffsController.createEditorHandoff(
      currentUser as never,
      projectId,
      'clipper-result-1',
    );

    expect(handoffWorkflowService.createEditorHandoff).toHaveBeenCalledWith(
      {
        clipperResultId: 'clipper-result-1',
        projectId,
      },
      {
        organizationId,
        userId,
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        editorPath: '/editor/editor-project-1',
        editorProjectId: 'editor-project-1',
      }),
    );
  });

  it('prepares publish handoff for a ready clip result', async () => {
    handoffWorkflowService.preparePublishHandoff.mockResolvedValue({
      clipperProjectId: projectId,
      clipperResultId: 'clipper-result-1',
      payload: {
        assets: [],
        clipperProjectId: projectId,
        confirmBeforePublish: true,
        metadata: {},
        platforms: ['instagram'],
        preparedAt: '2026-06-30T00:00:00.000Z',
        schedule: 'immediate',
      },
    });

    const result = await handoffsController.createPublishHandoff(
      currentUser as never,
      projectId,
      'clipper-result-1',
    );

    expect(handoffWorkflowService.preparePublishHandoff).toHaveBeenCalledWith(
      {
        clipperResultId: 'clipper-result-1',
        projectId,
      },
      {
        organizationId,
        userId: currentUser.userId,
      },
    );
    expect(result.payload).toEqual(
      expect.objectContaining({
        confirmBeforePublish: true,
      }),
    );
  });

  it('retries Library linking without re-rendering', async () => {
    handoffWorkflowService.retryLibraryLink.mockResolvedValue({
      clipperResultId: 'clipper-result-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    await expect(
      handoffsController.retryLibraryLink(
        currentUser as never,
        projectId,
        'clipper-result-1',
      ),
    ).resolves.toEqual({
      clipperResultId: 'clipper-result-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    expect(handoffWorkflowService.retryLibraryLink).toHaveBeenCalledWith(
      { clipperResultId: 'clipper-result-1', projectId },
      { organizationId, userId },
    );
  });
});
