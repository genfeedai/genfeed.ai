import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import {
  type ClipGenerationInput,
  type ClipGenerationResult,
  ClipGenerationService,
} from '@api/collections/clip-projects/services/clip-generation.service';
import { RawCutClipService } from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
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

function createInMemoryClipResultsService() {
  const records = new Map<string, ClipResultDocument>();
  let nextId = 1;

  const create = vi.fn(async (dto: CreateClipResultDto) => {
    const id = `clip-result-${nextId++}`;
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
    } as ClipResultDocument;

    records.set(id, record);
    return record;
  });

  const patch = vi.fn(async (id: string, update: Record<string, unknown>) => {
    const existing = records.get(id);
    if (!existing) {
      throw new Error(`Missing clip-result ${id}`);
    }

    const updated = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    } as ClipResultDocument;
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

function makeRawCutInput(): ClipGenerationInput {
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
        | ClipGenerationInput
        | undefined;
      const executor = actions.get('clip.generation.generate-one');
      if (!request || !executor) {
        throw new Error('Missing immutable clip generation test action');
      }
      const results: Array<{
        index: number;
        result: ClipGenerationResult & { originalIndex: number };
      }> = [];
      for (
        let originalIndex = 0;
        originalIndex < request.highlights.length;
        originalIndex++
      ) {
        const result = (await executor({
          context: {} as never,
          input: { originalIndex, request },
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Clip Generation',
          },
        })) as ClipGenerationResult;
        results.push({
          index: originalIndex,
          result: { ...result, originalIndex },
        });
      }
      return {
        execution: {
          executionId: 'execution-1',
          // Matches `buildClipGenerationWorkflowDefinition().resultNodeId` —
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
  let clipProjectsService: {
    patch: ReturnType<typeof vi.fn>;
    reconcileTerminalState: ReturnType<typeof vi.fn>;
  };
  let clipResultsService: ReturnType<typeof createInMemoryClipResultsService>;
  let completionService: RawCutClipCompletionService;
  let fileQueueService: ReturnType<typeof createFileQueueService>;
  let generationService: ClipGenerationService;

  beforeEach(() => {
    const logger = createMockLogger();
    avatarProvider = createAvatarProvider();
    avatarVideoService = {
      getProvider: vi.fn().mockReturnValue(avatarProvider),
    };
    clipProjectsService = {
      patch: vi.fn().mockResolvedValue(undefined),
      reconcileTerminalState: vi.fn().mockResolvedValue(undefined),
    };
    clipResultsService = createInMemoryClipResultsService();
    fileQueueService = createFileQueueService();

    const rawCutClipService = new RawCutClipService(
      fileQueueService as unknown as FileQueueService,
      logger,
    );
    const workflowRunner = createWorkflowHarness();
    generationService = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService,
      logger,
      undefined,
      clipProjectsService as unknown as ClipProjectsService,
      {
        get: vi.fn().mockReturnValue(workflowRunner),
      } as unknown as ModuleRef,
    );
    generationService.onModuleInit();
    completionService = new RawCutClipCompletionService(
      {
        linkReadyClip: vi.fn().mockResolvedValue({
          clipResultId: 'clip-result-1',
          ingredientId: 'ingredient-1',
          status: 'linked',
        }),
      } as never,
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
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
    const [clipResultId] = result.clipResultIds;

    expect(result).toEqual({
      clipResultIds: ['clip-result-1'],
      providerJobIds: ['raw-cut-trim-clip-result-1'],
      queuedClipCount: 1,
    });
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(1, {
      id: 'raw-cut-trim-clip-result-1',
      ingredientId: 'clip-result-1',
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
      websocketUrl: '/clips/clip-result-1',
    });
    expect(clipResultsService.records.get(clipResultId)).toMatchObject({
      captionSrt: '1\n00:00:01,960 --> 00:00:06,120\nKeep this caption',
      mode: 'raw-cut',
      providerJobId: 'raw-cut-trim-clip-result-1',
      providerName: 'raw-cut',
      status: 'extracting',
    });
    expect(avatarVideoService.getProvider).not.toHaveBeenCalled();

    await completionService.handleCompletion({
      ingredientId: clipResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-trim-clip-result-1',
        jobType: 'clip-trim',
        s3Key: 'videos/clip-result-1.mp4',
        url: 'https://cdn.test/clip-result-1.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(2, {
      id: 'raw-cut-frame-clip-result-1',
      ingredientId: 'clip-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        framingMode: 'contain-blur',
        height: 1920,
        s3Key: 'videos/clip-result-1.mp4',
        width: 1080,
      },
      room: undefined,
      type: 'convert-to-portrait',
      userId: USER_ID,
      websocketUrl: '/clips/clip-result-1',
    });
    expect(clipResultsService.records.get(clipResultId)).toMatchObject({
      providerJobId: 'raw-cut-frame-clip-result-1',
      status: 'reframing',
    });

    await completionService.handleCompletion({
      ingredientId: clipResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-frame-clip-result-1',
        jobType: 'convert-to-portrait',
        s3Key: 'videos/clip-result-1-portrait.mp4',
        url: 'https://cdn.test/clip-result-1-portrait.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(3, {
      id: 'raw-cut-caption-clip-result-1',
      ingredientId: 'clip-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        captionContent: '1\n00:00:01,960 --> 00:00:06,120\nKeep this caption',
        s3Key: 'videos/clip-result-1-portrait.mp4',
      },
      room: undefined,
      type: 'add-captions',
      userId: USER_ID,
      websocketUrl: '/clips/clip-result-1',
    });
    expect(clipResultsService.records.get(clipResultId)).toMatchObject({
      providerJobId: 'raw-cut-caption-clip-result-1',
      status: 'captioning',
      videoS3Key: 'videos/clip-result-1-portrait.mp4',
      videoUrl: 'https://cdn.test/clip-result-1-portrait.mp4',
    });

    await completionService.handleCompletion({
      ingredientId: clipResultId,
      organizationId: ORGANIZATION_ID,
      result: {
        jobId: 'raw-cut-caption-clip-result-1',
        jobType: 'add-captions',
        s3Key: 'videos/clip-result-1-captioned.mp4',
        url: 'https://cdn.test/clip-result-1-captioned.mp4',
      },
      status: Status.COMPLETED,
      userId: USER_ID,
    });

    expect(clipResultsService.records.get(clipResultId)).toMatchObject({
      captionedVideoS3Key: 'videos/clip-result-1-captioned.mp4',
      captionedVideoUrl: 'https://cdn.test/clip-result-1-captioned.mp4',
      isProjectReconciliationPending: false,
      status: 'completed',
      framing: expect.objectContaining({
        strategy: 'contain-blur',
        subjectSafety: 'full-source-visible',
      }),
      mediaValidation: expect.objectContaining({ status: 'passed' }),
      videoS3Key: 'videos/clip-result-1-portrait.mp4',
      videoUrl: 'https://cdn.test/clip-result-1-portrait.mp4',
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
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
        callbackId: 'clip-result-1',
        voiceId: 'voice-1',
      }),
    );
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
    expect(clipResultsService.records.get('clip-result-1')).toMatchObject({
      mode: 'avatar',
      providerJobId: 'heygen-job-1',
      providerName: 'heygen',
      status: 'extracting',
    });
  });
});
