import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import {
  type ClipperGenerationInput,
  type ClipperGenerationResult,
  ClipperGenerationService,
} from '@api/collections/clipper-projects/services/clipper-generation.service';
import { RawCutClipService } from '@api/collections/clipper-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clipper-projects/services/raw-cut-clip-completion.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { CreateClipperResultDto } from '@api/collections/clipper-results/dto/create-clipper-result.dto';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type {
  FileProcessingJob,
  FileQueueService,
} from '@api/services/files-microservice/queue/file-queue.service';
import { Status, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

const ORGANIZATION_ID = testId('org');
const PROJECT_ID = testId('project');
const USER_ID = testId('user');

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createInMemoryClipperResultsService() {
  const records = new Map<string, ClipperResultDocument>();
  let nextId = 1;

  const create = vi.fn(async (dto: CreateClipperResultDto) => {
    const id = `clipper-result-${nextId++}`;
    const now = new Date();
    const record = {
      captionSrt: null,
      createdAt: now,
      data: {},
      duration: dto.duration,
      endTime: dto.endTime,
      id,
      isDeleted: false,
      isProjectReconciliationPending: false,
      isSelected: dto.isSelected ?? false,
      mode: dto.mode ?? 'avatar',
      organizationId: dto.organizationId,
      projectId: dto.projectId,
      providerJobId: dto.providerJobId ?? null,
      readiness: {},
      startTime: dto.startTime,
      status: dto.status ?? 'pending',
      terminalAt: null,
      updatedAt: now,
      userId: String(dto.userId),
      viralityScore: dto.viralityScore ?? null,
    } as ClipperResultDocument;

    records.set(id, record);
    return record;
  });

  const patch = vi.fn(async (id: string, update: Record<string, unknown>) => {
    const existing = records.get(id);
    if (!existing) {
      throw new Error(`Missing clipper-result ${id}`);
    }

    const updated = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    } as ClipperResultDocument;
    records.set(id, updated);
    return updated;
  });

  const findOne = vi.fn(async (where: Record<string, unknown>) => {
    const record = records.get(String(where.id));
    if (
      !record ||
      record.organizationId !== where.organizationId ||
      record.isDeleted !== where.isDeleted
    ) {
      return null;
    }
    return record;
  });

  return { create, findOne, patch, records };
}

function createFileQueueService() {
  return {
    getJobStatus: vi.fn(),
    processVideo: vi.fn(async (job: FileProcessingJob) => ({
      ingredientId: job.ingredientId,
      jobId: job.id ?? '',
      status: 'waiting',
      type: job.type,
    })),
  };
}

function createAvatarProvider(): AvatarVideoProvider {
  return {
    generateVideo: vi.fn().mockResolvedValue({
      jobId: 'heygen-job-1',
      providerName: 'heygen',
      status: 'processing',
    }),
    getStatus: vi.fn().mockResolvedValue({
      jobId: 'heygen-job-1',
      providerName: 'heygen',
      status: 'processing',
    }),
    providerName: 'heygen',
  };
}

function makeRawCutInput(): ClipperGenerationInput {
  return {
    highlights: [
      {
        clip_type: 'hook',
        end_time: 24,
        start_time: 10,
        summary: 'A deterministic clip',
        tags: ['raw-cut'],
        title: 'Deterministic clip',
        virality_score: 91,
      },
    ],
    mode: 'raw-cut',
    orgId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    sourceVideoS3Key: 'videos/source.mp4',
    transcriptSegments: [
      { end: 16, start: 12, text: 'Keep this caption' },
      { end: 40, start: 30, text: 'Outside the clip' },
    ],
    userId: USER_ID,
  };
}

function createWorkflowHarness() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  return {
    registerAction(
      actionId: string,
      executor: SystemWorkflowActionExecutor,
    ): void {
      actions.set(actionId, executor);
    },
    registerWorkflow(): void {},
    async startWorkflow(input: { inputValues?: Record<string, unknown> }) {
      const request = input.inputValues?.request as
        | ClipperGenerationInput
        | undefined;
      const executor = actions.get('clipper.generation.generate-one');
      if (!request || !executor) {
        throw new Error('Missing immutable clip generation test action');
      }
      const results: Array<{
        index: number;
        result: ClipperGenerationResult & { originalIndex: number };
      }> = [];
      for (
        let originalIndex = 0;
        originalIndex < request.highlights.length;
        originalIndex++
      ) {
        const result = (await executor({
          context: {
            organizationId: request.orgId,
            userId: request.userId,
          } as never,
          input: { originalIndex, request },
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Clip Generation',
          },
        })) as ClipperGenerationResult;
        results.push({
          index: originalIndex,
          result: { ...result, originalIndex },
        });
      }
      return {
        execution: {
          executionId: 'execution-1',
          // Matches `buildClipperGenerationWorkflowDefinition().resultNodeId` —
          // a single-highlight batch never trips the hook-review branch, so
          // `collectForEachResults` only ever reads `generate-remaining`.
          nodeResults: [
            {
              creditsUsed: 0,
              nodeId: 'generate-remaining',
              nodeType: 'genfeedAction',
              output: { count: results.length, results },
              retryCount: 0,
              status: 'COMPLETED',
            },
          ],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.COMPLETED,
          totalCreditsUsed: 0,
          workflowId: 'workflow-1',
        },
        provenance: {
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Clip Generation',
        },
        userId: request.userId,
      };
    },
  };
}

describe('raw-cut clip pipeline integration', () => {
  let avatarProvider: AvatarVideoProvider;
  let avatarVideoService: {
    getProvider: ReturnType<typeof vi.fn>;
  };
  let clipperProjectsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    reconcileTerminalState: ReturnType<typeof vi.fn>;
  };
  let clipperResultsService: ReturnType<
    typeof createInMemoryClipperResultsService
  >;
  let completionService: RawCutClipCompletionService;
  let fileQueueService: ReturnType<typeof createFileQueueService>;
  let generationService: ClipperGenerationService;

  beforeEach(() => {
    const logger = createMockLogger();
    avatarProvider = createAvatarProvider();
    avatarVideoService = {
      getProvider: vi.fn().mockReturnValue(avatarProvider),
    };
    clipperProjectsService = {
      findOne: vi.fn().mockResolvedValue({ captionStyle: 'default' }),
      patch: vi.fn().mockResolvedValue(undefined),
      reconcileTerminalState: vi.fn().mockResolvedValue(undefined),
    };
    clipperResultsService = createInMemoryClipperResultsService();
    fileQueueService = createFileQueueService();

    const rawCutClipService = new RawCutClipService(
      fileQueueService as unknown as FileQueueService,
      logger,
    );
    const workflowRunner = createWorkflowHarness();
    generationService = new ClipperGenerationService(
      clipperResultsService as unknown as ClipperResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService,
      logger,
      {} as ClipperAvatarBillingService,
      undefined,
      clipperProjectsService as unknown as ClipperProjectsService,
      {
        get: vi.fn().mockReturnValue(workflowRunner),
      } as unknown as ModuleRef,
    );
    generationService.onModuleInit();
    completionService = new RawCutClipCompletionService(
      {
        linkReadyClip: vi.fn().mockResolvedValue({
          clipperResultId: 'clipper-result-1',
          ingredientId: 'ingredient-1',
          status: 'linked',
        }),
      } as never,
      clipperProjectsService as unknown as ClipperProjectsService,
      clipperResultsService as unknown as ClipperResultsService,
      fileQueueService as unknown as FileQueueService,
      {
        inspectVideoQa: vi.fn().mockResolvedValue({
          decodeOk: true,
          detectLog: '',
          loudnessLog: '-16 LUFS',
          probeJson: JSON.stringify({
            format: { duration: '14' },
            streams: [
              {
                codec_name: 'h264',
                codec_type: 'video',
                height: 1920,
                width: 1080,
              },
              { codec_name: 'aac', codec_type: 'audio' },
            ],
          }),
        }),
      } as unknown as FilesClientService,
      rawCutClipService,
      logger,
    );
  });

  it('persists completed raw-cut outputs after trim, framing, caption, and QA', async () => {
    const result = await generationService.generateClips(makeRawCutInput());
    const [clipperResultId] = result.clipperResultIds;

    expect(result).toEqual({
      clipperResultIds: ['clipper-result-1'],
      providerJobIds: ['raw-cut-trim-clipper-result-1'],
      queuedClipCount: 1,
    });
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(1, {
      id: 'raw-cut-trim-clipper-result-1',
      ingredientId: 'clipper-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        captionContent: '1\n00:00:01,960 --> 00:00:06,120\nKeep this caption',
        duration: 14,
        endTime: 24,
        inputPath: undefined,
        s3Key: 'videos/source.mp4',
        startTime: 10,
      },
      room: undefined,
      type: 'clip-trim',
      userId: USER_ID,
      websocketUrl: '/clips/clipper-result-1',
    });
    expect(clipperResultsService.records.get(clipperResultId)).toMatchObject({
      captionSrt: '1\n00:00:01,960 --> 00:00:06,120\nKeep this caption',
      mode: 'raw-cut',
      providerJobId: 'raw-cut-trim-clipper-result-1',
      providerName: 'raw-cut',
      status: 'extracting',
    });
    expect(avatarVideoService.getProvider).not.toHaveBeenCalled();

    await completionService.handleCompletion({
      ingredientId: clipperResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-trim-clipper-result-1',
        jobType: 'clip-trim',
        s3Key: 'videos/clipper-result-1.mp4',
        url: 'https://cdn.test/clipper-result-1.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(2, {
      id: 'raw-cut-frame-clipper-result-1',
      ingredientId: 'clipper-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        framingMode: 'contain-blur',
        height: 1920,
        s3Key: 'videos/clipper-result-1.mp4',
        width: 1080,
      },
      room: undefined,
      type: 'convert-to-portrait',
      userId: USER_ID,
      websocketUrl: '/clips/clipper-result-1',
    });
    expect(clipperResultsService.records.get(clipperResultId)).toMatchObject({
      providerJobId: 'raw-cut-frame-clipper-result-1',
      status: 'reframing',
    });

    await completionService.handleCompletion({
      ingredientId: clipperResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-frame-clipper-result-1',
        jobType: 'convert-to-portrait',
        s3Key: 'videos/clipper-result-1-portrait.mp4',
        url: 'https://cdn.test/clipper-result-1-portrait.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(3, {
      id: 'raw-cut-caption-clipper-result-1',
      ingredientId: 'clipper-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        captionContent: '1\n00:00:01,960 --> 00:00:06,120\nKeep this caption',
        captionStyle: { fontSizeRatio: 0.058, textCase: 'as-is' },
        s3Key: 'videos/clipper-result-1-portrait.mp4',
      },
      room: undefined,
      type: 'add-captions',
      userId: USER_ID,
      websocketUrl: '/clips/clipper-result-1',
    });
    expect(clipperResultsService.records.get(clipperResultId)).toMatchObject({
      providerJobId: 'raw-cut-caption-clipper-result-1',
      status: 'captioning',
      videoS3Key: 'videos/clipper-result-1-portrait.mp4',
      videoUrl: 'https://cdn.test/clipper-result-1-portrait.mp4',
    });

    await completionService.handleCompletion({
      ingredientId: clipperResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-caption-clipper-result-1',
        jobType: 'add-captions',
        s3Key: 'videos/clipper-result-1-captioned.mp4',
        url: 'https://cdn.test/clipper-result-1-captioned.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(clipperResultsService.records.get(clipperResultId)).toMatchObject({
      captionedVideoS3Key: 'videos/clipper-result-1-captioned.mp4',
      captionedVideoUrl: 'https://cdn.test/clipper-result-1-captioned.mp4',
      isProjectReconciliationPending: false,
      status: 'completed',
      framing: expect.objectContaining({
        strategy: 'contain-blur',
        subjectSafety: 'full-source-visible',
      }),
      mediaValidation: expect.objectContaining({ status: 'passed' }),
      videoS3Key: 'videos/clipper-result-1-portrait.mp4',
      videoUrl: 'https://cdn.test/clipper-result-1-portrait.mp4',
    });
    expect(clipperProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      PROJECT_ID,
      ORGANIZATION_ID,
    );
  });

  it('keeps avatar mode on the avatar provider without files jobs', async () => {
    await generationService.generateClips({
      avatarId: 'avatar-1',
      highlights: makeRawCutInput().highlights,
      orgId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      voiceId: 'voice-1',
    });

    expect(avatarVideoService.getProvider).toHaveBeenCalledWith('heygen');
    expect(avatarProvider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: 'avatar-1',
        callbackId: 'clipper-result-1',
        voiceId: 'voice-1',
      }),
    );
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
    expect(clipperResultsService.records.get('clipper-result-1')).toMatchObject(
      {
        mode: 'avatar',
        providerJobId: 'heygen-job-1',
        providerName: 'heygen',
        status: 'extracting',
      },
    );
  });
});
