import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type {
  FileProcessingJob,
  FileQueueService,
} from '@api/services/files-microservice/queue/file-queue.service';
import { Status } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ClipGenerationInput,
  ClipGenerationService,
} from './clip-generation.service';
import { RawCutClipService } from './raw-cut-clip.service';
import { RawCutClipCompletionService } from './raw-cut-clip-completion.service';

const ORGANIZATION_ID = '507f1f77bcf86cd799439011';
const PROJECT_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

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
    const values = dto as unknown as Record<string, unknown>;
    const id = `clip-result-${nextId++}`;
    const now = new Date();
    const record = {
      _id: id,
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
      organizationId: dto.organization,
      projectId: dto.project,
      providerJobId: dto.providerJobId ?? null,
      readiness: {},
      startTime: dto.startTime,
      status: dto.status ?? 'pending',
      terminalAt: null,
      updatedAt: now,
      userId: String(values.userId ?? dto.user),
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
    const record = records.get(String(where._id));
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

describe('raw-cut clip pipeline integration', () => {
  let avatarProvider: AvatarVideoProvider;
  let avatarVideoService: {
    getProvider: ReturnType<typeof vi.fn>;
  };
  let clipProjectsService: {
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
      reconcileTerminalState: vi.fn().mockResolvedValue(undefined),
    };
    clipResultsService = createInMemoryClipResultsService();
    fileQueueService = createFileQueueService();

    const rawCutClipService = new RawCutClipService(
      fileQueueService as unknown as FileQueueService,
      logger,
    );
    generationService = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService,
      logger,
    );
    completionService = new RawCutClipCompletionService(
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
      fileQueueService as unknown as FileQueueService,
      rawCutClipService,
      logger,
    );
  });

  it('persists completed raw-cut outputs after trim and caption jobs', async () => {
    const result = await generationService.generateClips(makeRawCutInput());
    const [clipResultId] = result.clipResultIds;

    expect(result).toEqual({
      clipResultIds: ['clip-result-1'],
      providerJobIds: ['raw-cut-trim-clip-result-1'],
      queuedClipCount: 1,
    });
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(1, {
      authProviderUserId: undefined,
      id: 'raw-cut-trim-clip-result-1',
      ingredientId: 'clip-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        captionContent: '1\n00:00:02,000 --> 00:00:06,000\nKeep this caption',
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
      captionSrt: '1\n00:00:02,000 --> 00:00:06,000\nKeep this caption',
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
      authProviderUserId: undefined,
      id: 'raw-cut-caption-clip-result-1',
      ingredientId: 'clip-result-1',
      organizationId: ORGANIZATION_ID,
      params: {
        captionContent: '1\n00:00:02,000 --> 00:00:06,000\nKeep this caption',
        s3Key: 'videos/clip-result-1.mp4',
      },
      room: undefined,
      type: 'add-captions',
      userId: USER_ID,
      websocketUrl: '/clips/clip-result-1',
    });
    expect(clipResultsService.records.get(clipResultId)).toMatchObject({
      providerJobId: 'raw-cut-caption-clip-result-1',
      status: 'captioning',
      videoS3Key: 'videos/clip-result-1.mp4',
      videoUrl: 'https://cdn.test/clip-result-1.mp4',
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
      videoS3Key: 'videos/clip-result-1.mp4',
      videoUrl: 'https://cdn.test/clip-result-1.mp4',
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
