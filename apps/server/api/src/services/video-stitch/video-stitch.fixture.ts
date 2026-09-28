import type { CaptionsService } from '@api/collections/captions/services/captions.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { InternalMediaDocumentsInput } from '@api/shared/services/shared/media-documents.types';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientStatus, JobState } from '@genfeedai/contracts';
import type { IFileProcessingJob } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * In-memory collaborators for specs that drive the real VideoStitchService
 * (#5460). Fakes record what the service did instead of mocking it, so the
 * stitch, caller and parity specs assert one behaviour. Nothing here reaches
 * a database, queue or provider.
 */
export interface StitchFixtureRow {
  brandId: string | null;
  category: string;
  generationError: string | null;
  generationSource: string | null;
  id: string;
  isDeleted: boolean;
  mergeSettings: unknown;
  metadataId: string | null;
  organizationId: string | null;
  parentId?: string | null;
  providerData?: unknown;
  s3Key: string | null;
  sourceActionId: string | null;
  sources: string[];
  status: string;
  transformations: string[];
  userId: string | null;
}

export interface StitchFixtureEvent {
  args: unknown[];
  name: string;
}

type Where = Record<string, unknown>;

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === 'object' &&
    !Array.isArray(condition)
  ) {
    const record = condition as Record<string, unknown>;
    if ('in' in record) {
      return (record.in as unknown[]).includes(value);
    }
    if ('not' in record) {
      return value !== record.not;
    }
    return true;
  }
  return value === condition;
}

function matches(row: object, where: Where): boolean {
  const record = row as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Where[]).some((branch) => matches(row, branch));
    }
    return matchesCondition(record[key], condition);
  });
}

function project(row: StitchFixtureRow, select?: Record<string, unknown>) {
  if (!select) {
    return { ...row };
  }
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    projected[key] =
      key === '_count'
        ? { sources: row.sources.length }
        : (row as unknown as Record<string, unknown>)[key];
  }
  return projected;
}

export class VideoStitchFixture {
  readonly events: StitchFixtureEvent[] = [];
  readonly failWaitFor = new Map<string, Error>();
  readonly jobResults = new Map<string, Record<string, unknown>>();
  readonly jobStates = new Map<string, JobState>();
  readonly queued: IFileProcessingJob[] = [];
  readonly rows = new Map<string, StitchFixtureRow>();
  readonly service: VideoStitchService;
  private sequence = 0;

  constructor() {
    this.service = new VideoStitchService(
      this.activityRecorder() as unknown as ActivityRecorderService,
      this.captions() as unknown as CaptionsService,
      this.queue() as unknown as FileQueueService,
      this.logger() as unknown as LoggerService,
      this.prisma() as unknown as PrismaService,
      this.shared() as unknown as SharedService,
      this.publisher() as unknown as NotificationsPublisherService,
      this.whisper() as unknown as WhisperService,
    );
  }

  addClip(overrides: Partial<StitchFixtureRow> & { id: string }): void {
    this.rows.set(overrides.id, {
      brandId: 'brand-1',
      category: 'VIDEO',
      generationError: null,
      generationSource: null,
      isDeleted: false,
      mergeSettings: null,
      metadataId: null,
      organizationId: 'org-1',
      s3Key: `ingredients/videos/${overrides.id}.mp4`,
      sourceActionId: null,
      sources: [],
      status: IngredientStatus.GENERATED,
      transformations: [],
      userId: 'user-1',
      ...overrides,
    });
  }

  row(id: string): StitchFixtureRow {
    const row = this.rows.get(id);
    if (!row) throw new Error(`No fixture row ${id}`);
    return row;
  }

  outputs(): StitchFixtureRow[] {
    return [...this.rows.values()].filter(
      (row) =>
        !row.isDeleted && row.generationSource?.startsWith('video-stitch:'),
    );
  }

  eventNames(): string[] {
    return this.events.map((event) => event.name);
  }

  eventsNamed(name: string): unknown[][] {
    return this.events
      .filter((event) => event.name === name)
      .map((event) => event.args);
  }

  mergeJobs(): IFileProcessingJob[] {
    return this.queued.filter((job) => job.type === 'merge-videos');
  }

  /** Makes the worker finish a job with a persisted output. */
  completeJob(jobId: string, s3Key: string): void {
    this.jobStates.set(jobId, JobState.COMPLETED);
    this.jobResults.set(jobId, {
      duration: 12,
      height: 1920,
      s3Key,
      size: 2048,
      success: true,
      url: `https://cdn.test/${s3Key}`,
      width: 1080,
    });
  }

  private record(name: string, ...args: unknown[]): void {
    this.events.push({ args, name });
  }

  private prisma() {
    return {
      ingredient: {
        findFirst: async ({
          select,
          where,
        }: {
          orderBy?: unknown;
          select?: Record<string, unknown>;
          where: Where;
        }) => {
          const row = [...this.rows.values()].find((candidate) =>
            matches(candidate, where),
          );
          return row ? project(row, select) : null;
        },
        findMany: async ({
          select,
          where,
        }: {
          select?: Record<string, unknown>;
          where: Where;
        }) =>
          [...this.rows.values()]
            .filter((candidate) => matches(candidate, where))
            .map((row) => project(row, select)),
        updateMany: async ({ data, where }: { data: Where; where: Where }) => {
          const hits = [...this.rows.values()].filter((candidate) =>
            matches(candidate, where),
          );
          for (const hit of hits) Object.assign(hit, data);
          return { count: hits.length };
        },
      },
      metadata: {
        updateMany: async ({ data, where }: { data: Where; where: Where }) => {
          this.record('metadata.update', where.id, data);
          return { count: 1 };
        },
      },
    };
  }

  private shared() {
    return {
      createMediaDocumentsInternal: async (
        input: InternalMediaDocumentsInput,
      ) => {
        this.sequence += 1;
        const id = `output-${this.sequence}`;
        this.rows.set(id, {
          brandId: input.brandId,
          category: String(input.category),
          generationError: null,
          generationSource: input.generationSource ?? null,
          id,
          isDeleted: false,
          mergeSettings: input.mergeSettings ?? null,
          metadataId: `metadata-${this.sequence}`,
          organizationId: input.organizationId,
          parentId: input.parentId ?? null,
          providerData: input.providerData,
          s3Key: null,
          sourceActionId: input.sourceActionId ?? null,
          sources: [...new Set(input.sourceIds ?? [])],
          status: String(input.status),
          transformations: (input.transformations ?? []).map(String),
          userId: input.userId,
        });
        return {
          ingredientData: { id },
          metadataData: { id: `metadata-${this.sequence}` },
        };
      },
    };
  }

  private queue() {
    return {
      getJobStatus: async (jobId: string) => ({
        failedReason:
          this.jobStates.get(jobId) === JobState.FAILED
            ? 'ffmpeg exited'
            : undefined,
        jobId,
        result: this.jobResults.get(jobId),
        state: this.jobStates.get(jobId) ?? JobState.WAITING,
      }),
      processVideo: async (job: IFileProcessingJob) => {
        this.queued.push(job);
        const jobId = job.id ?? `${job.type}-${this.queued.length}`;
        if (job.type === 'add-captions') {
          this.completeJob(jobId, `ingredients/videos/${job.ingredientId}`);
        }
        return { jobId };
      },
      // Polls like the real queue client, so a spec can finish the job after
      // the caller started waiting.
      waitForJob: async (jobId: string) => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const failure = this.failWaitFor.get(jobId);
          if (failure) throw failure;
          const result = this.jobResults.get(jobId);
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        throw new Error('Job timeout');
      },
    };
  }

  private activityRecorder() {
    return {
      record: async (input: Record<string, unknown>) => {
        this.record('activity.record', input);
        return { id: input.id };
      },
      update: async (ref: Record<string, unknown>, input: unknown) => {
        this.record('activity.update', ref, input);
        return null;
      },
    };
  }

  private publisher() {
    return {
      publishBackgroundTaskUpdate: async (payload: unknown) =>
        this.record('background', payload),
      publishMediaFailed: async (...args: unknown[]) =>
        this.record('media.failed', ...args),
      publishVideoComplete: async (...args: unknown[]) =>
        this.record('video.complete', ...args),
    };
  }

  private captions() {
    return {
      create: async (input: unknown) => {
        this.record('caption.create', input);
        return { id: 'caption-1' };
      },
      patch: async (id: string, input: unknown) =>
        this.record('caption.patch', id, input),
    };
  }

  private whisper() {
    return {
      generateCaptions: async (id: string) => {
        this.record('whisper', id);
        return 'caption content';
      },
    };
  }

  private logger() {
    return {
      debug: (...args: unknown[]) => this.record('log.debug', ...args),
      error: (...args: unknown[]) => this.record('log.error', ...args),
      log: (...args: unknown[]) => this.record('log.info', ...args),
      warn: (...args: unknown[]) => this.record('log.warn', ...args),
    };
  }
}
