import { randomUUID } from 'node:crypto';
import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import { ClipRunStepDto } from '@api/services/clip-orchestrator/dto/clip-run-step.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum MergeJobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Done = 'done',
  Failed = 'failed',
}

export interface VideoMergeItem {
  /** Clip result ID. */
  id: string;
  /** S3 key or URL of the video. */
  videoUrl: string;
  /** Sort order within the merged output. */
  order: number;
}

export interface VideoMergeQueue {
  /** Clip project this merge belongs to. */
  clipProjectId: string;
  /** Ordered list of videos to merge. */
  items: VideoMergeItem[];
  /** ISO timestamp when the queue was created. */
  createdAt: string;
}

export interface MergeJob {
  /** Unique job identifier. */
  jobId: string;
  /** Current status of the merge. */
  status: MergeJobStatus;
  /** Clip project this job belongs to. */
  clipProjectId: string;
  /** Number of videos being merged. */
  videoCount: number;
  /** URL of the merged output (available when done). */
  outputUrl?: string;
  /** Error message if the job failed. */
  error?: string;
  /** ISO timestamp when the job was created. */
  createdAt: string;
  /** ISO timestamp of the last status change. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class VideoMergeService {
  private readonly logContext = 'VideoMergeService';

  /**
   * In-memory job store. In production this would be backed by a database
   * collection or a BullMQ queue. Kept simple for the initial integration.
   */
  private readonly jobs = new Map<string, MergeJob>();

  constructor(private readonly logger: LoggerService) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Validate and prepare a merge queue from a clip project and selected clip
   * result IDs. Throws if fewer than 2 videos are selected.
   */
  async selectVideosForMerge(
    clipProjectId: string,
    selectedIds: string[],
  ): Promise<VideoMergeQueue> {
    if (!clipProjectId) {
      throw new Error('clipProjectId is required');
    }
    if (!selectedIds || selectedIds.length < 2) {
      throw new Error('At least 2 videos must be selected for merge');
    }

    const items: VideoMergeItem[] = selectedIds.map((id, index) => ({
      id,
      order: index,
      videoUrl: '', // resolved downstream by the orchestrator
    }));

    this.logger.log(`${this.logContext} prepared merge queue`, {
      clipProjectId,
      videoCount: items.length,
    });

    return {
      clipProjectId,
      createdAt: new Date().toISOString(),
      items,
    };
  }

  /**
   * Queue a merge job for processing. Returns a job handle that can be polled
   * via {@link getMergeStatus}.
   */
  async queueMerge(queue: VideoMergeQueue): Promise<MergeJob> {
    if (!queue || !queue.items || queue.items.length === 0) {
      throw new Error('Merge queue must contain at least one item');
    }

    const now = new Date().toISOString();
    const job: MergeJob = {
      clipProjectId: queue.clipProjectId,
      createdAt: now,
      jobId: randomUUID(),
      status: MergeJobStatus.Pending,
      updatedAt: now,
      videoCount: queue.items.length,
    };

    this.jobs.set(job.jobId, job);

    this.logger.log(`${this.logContext} merge job queued`, {
      clipProjectId: queue.clipProjectId,
      jobId: job.jobId,
      videoCount: queue.items.length,
    });

    return job;
  }

  /**
   * Retrieve the current status of a merge job.
   */
  async getMergeStatus(jobId: string): Promise<MergeJobStatus> {
    if (!jobId) {
      throw new Error('jobId is required');
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Merge job not found: ${jobId}`);
    }

    return job.status;
  }

  // -------------------------------------------------------------------------
  // Internal helpers (used by the orchestrator to advance job state)
  // -------------------------------------------------------------------------

  /**
   * Transition a job to a new status. Returns the updated job.
   */
  updateJobStatus(
    jobId: string,
    status: MergeJobStatus,
    extra?: { outputUrl?: string; error?: string },
  ): MergeJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Merge job not found: ${jobId}`);
    }

    job.status = status;
    job.updatedAt = new Date().toISOString();
    if (extra?.outputUrl) job.outputUrl = extra.outputUrl;
    if (extra?.error) job.error = extra.error;

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Build a {@link ClipRunStepDto} that represents the merge step for a given
   * job, so it can be tracked in the clip run lifecycle.
   */
  buildRunStep(job: MergeJob): ClipRunStepDto {
    const stateMap: Record<MergeJobStatus, ClipRunState> = {
      [MergeJobStatus.Pending]: ClipRunState.Merging,
      [MergeJobStatus.Processing]: ClipRunState.Merging,
      [MergeJobStatus.Done]: ClipRunState.Done,
      [MergeJobStatus.Failed]: ClipRunState.Failed,
    };

    return {
      completedAt:
        job.status === MergeJobStatus.Done ||
        job.status === MergeJobStatus.Failed
          ? new Date(job.updatedAt)
          : undefined,
      error: job.error,
      output: job.outputUrl ? { mergedVideoUrl: job.outputUrl } : undefined,
      retryCount: 0,
      startedAt: new Date(job.createdAt),
      state: stateMap[job.status],
      stepId: `merge-${job.jobId}`,
    };
  }
}
