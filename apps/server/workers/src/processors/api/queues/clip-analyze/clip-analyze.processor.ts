/**
 * Clip Analyze Processor
 *
 * BullMQ worker that runs the cheap analysis pipeline only:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM (GPT-4o)
 * 4. Filter by minViralityScore
 * 5. Extract bounded reference frames from highlight timestamps
 * 6. Save highlights and reference frames (status: 'analyzed')
 *
 * Does NOT generate avatar videos — that's the clip-factory queue.
 */

import { randomUUID } from 'node:crypto';
import {
  CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
} from '@genfeedai/constants';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import {
  normalizeClipReferenceFrameSet,
  normalizeClipReferenceTimestamps,
} from '@genfeedai/helpers';
import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipReferenceFrameSet,
  type ClipSourceArtifact,
} from '@genfeedai/interfaces';
import {
  CLIP_ANALYZE_CONCURRENCY,
  CLIP_ANALYZE_QUEUE,
  ClipAnalyzeJobData,
  type ClipAnalyzeJobResult,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { OnModuleInit } from '@nestjs/common';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import type { IHighlight } from '@server/collections/clip-projects/schemas/clip-project.schema';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { PublicClipToolStoreService } from '@server/services/public-clip-tool/public-clip-tool-store.service';
import { WhisperService } from '@server/services/whisper/whisper.service';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

function deriveReferenceTimestamps(highlights: IHighlight[]): number[] {
  return normalizeClipReferenceTimestamps(
    highlights
      .filter(
        (highlight) =>
          Number.isFinite(highlight.start_time) &&
          Number.isFinite(highlight.end_time) &&
          highlight.start_time >= 0 &&
          highlight.end_time >= highlight.start_time,
      )
      .map((highlight) => (highlight.start_time + highlight.end_time) / 2),
  );
}

function pendingReferenceFrames(timestamps: number[]): ClipReferenceFrameSet {
  return {
    candidates: timestamps.map((timestampSeconds, index) => ({
      assetId: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      diagnostics: [],
      id: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      status: 'pending',
      timestampSeconds,
    })),
    diagnostics: [],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'pending',
  };
}

function unavailableReferenceFrames(
  code: string,
  message: string,
): ClipReferenceFrameSet {
  return {
    candidates: [],
    diagnostics: [{ code, message, severity: 'warning' }],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'unavailable',
  };
}

interface AudioExtractionResult {
  audioUrl: string;
  sourceArtifact?: ClipSourceArtifact;
}

const PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX = 'public-youtube-clip-session-';
const CLIP_ANALYSIS_WORKFLOW_ID = 'clip.analysis';
const CLIP_ANALYSIS_ACTION_IDS = {
  DETECT_HIGHLIGHTS: 'clip.analysis.detect-highlights',
  FAIL: 'clip.analysis.fail',
  PERSIST: 'clip.analysis.persist',
  PREPARE_SOURCE: 'clip.analysis.prepare-source',
  REFERENCE_FRAMES: 'clip.analysis.extract-reference-frames',
  TRANSCRIBE: 'clip.analysis.transcribe',
} as const;

type PreparedClipAnalysis = {
  audioUrl: string;
  data: ClipAnalyzeJobData;
  sourceArtifact?: ClipSourceArtifact;
  sourceUrl: string;
};

type TranscribedClipAnalysis = PreparedClipAnalysis & {
  transcription: Awaited<ReturnType<WhisperService['transcribeUrl']>>;
};

type HighlightedClipAnalysis = TranscribedClipAnalysis & {
  highlights: IHighlight[];
};

type ReferencedClipAnalysis = HighlightedClipAnalysis & {
  referenceFrames: ClipReferenceFrameSet;
};

@Processor(
  CLIP_ANALYZE_QUEUE,
  withLongJobWorkerOptions({
    concurrency: CLIP_ANALYZE_CONCURRENCY,
    limiter: { duration: 60_000, max: 5 },
  }),
)
export class ClipAnalyzeProcessor extends WorkerHost implements OnModuleInit {
  private readonly logContext = 'ClipAnalyzeProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipHighlightDetector,
    private readonly publicClipToolStore: PublicClipToolStoreService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
      (request) => this.prepareSourceAction(request),
      {
        description: 'Prepares one clip-analysis source for transcription.',
        label: 'Prepare Clip Analysis Source',
      },
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.TRANSCRIBE,
      (request) => this.transcribeAction(request),
      {
        description: 'Transcribes one prepared clip-analysis source.',
        label: 'Transcribe Clip Analysis Source',
      },
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
      (request) => this.detectHighlightsAction(request),
      {
        description: 'Detects and scores clip highlights in one transcript.',
        label: 'Detect Clip Highlights',
      },
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
      (request) => this.extractReferenceFramesAction(request),
      {
        description: 'Extracts bounded reference frames for clip highlights.',
        label: 'Extract Clip Reference Frames',
      },
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.PERSIST,
      (request) => this.persistAnalysisAction(request),
      {
        description: 'Persists one completed clip analysis.',
        label: 'Persist Clip Analysis',
      },
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.FAIL,
      (request) => this.failAnalysisAction(request),
      {
        description: 'Persists one failed clip analysis.',
        label: 'Fail Clip Analysis',
      },
    );
    this.workflowRunner.registerWorkflow({
      canonicalId: CLIP_ANALYSIS_WORKFLOW_ID,
      definition: {
        edges: [
          this.actionEdge(
            'prepare-to-transcribe',
            'prepare-source',
            'transcribe',
            'prepared',
          ),
          this.actionEdge(
            'transcribe-to-highlights',
            'transcribe',
            'detect-highlights',
            'transcribed',
          ),
          this.actionEdge(
            'highlights-to-frames',
            'detect-highlights',
            'reference-frames',
            'highlighted',
          ),
          this.actionEdge(
            'frames-to-persist',
            'reference-frames',
            'persist-analysis',
            'referenced',
          ),
        ],
        inputVariables: [
          {
            key: 'job',
            label: 'Clip analysis job',
            required: true,
            type: 'json',
          },
        ],
        nodes: [
          this.actionNode(
            'prepare-source',
            CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
            'Prepare source',
            ['job'],
            0,
          ),
          this.actionNode(
            'transcribe',
            CLIP_ANALYSIS_ACTION_IDS.TRANSCRIBE,
            'Transcribe source',
            [],
            280,
          ),
          this.actionNode(
            'detect-highlights',
            CLIP_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
            'Detect highlights',
            [],
            560,
          ),
          this.actionNode(
            'reference-frames',
            CLIP_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
            'Extract reference frames',
            [],
            840,
          ),
          this.actionNode(
            'persist-analysis',
            CLIP_ANALYSIS_ACTION_IDS.PERSIST,
            'Persist analysis',
            [],
            1120,
          ),
        ],
      },
      description:
        'Prepares, transcribes, analyzes, enriches, and persists one clip source.',
      label: 'Clip Analysis',
      resultNodeId: 'persist-analysis',
      version: 1,
    });
  }

  async process(job: Job<ClipAnalyzeJobData>): Promise<ClipAnalyzeJobResult> {
    const { data } = job;
    this.logger.log(`${this.logContext} starting analysis workflow`, {
      jobId: job.id,
      projectId: data.projectId,
    });

    try {
      const { result } =
        await this.workflowRunner.runWorkflow<ClipAnalyzeJobResult>({
          actionType: CLIP_ANALYSIS_WORKFLOW_ID,
          canonicalId: CLIP_ANALYSIS_WORKFLOW_ID,
          inputValues: { job: data },
          metadata: { origin: 'worker', queueJobId: String(job.id ?? '') },
          organizationId: data.orgId,
          source: 'ClipAnalyzeProcessor.process',
          trigger: WorkflowExecutionTrigger.EVENT,
          userId: data.userId,
        });
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown analysis error';
      this.logger.error(`${this.logContext} analysis workflow failed`, error);
      await this.workflowRunner
        .runAction({
          actionType: CLIP_ANALYSIS_ACTION_IDS.FAIL,
          canonicalId: CLIP_ANALYSIS_ACTION_IDS.FAIL,
          inputValues: { errorMessage, job: data },
          metadata: { origin: 'worker', queueJobId: String(job.id ?? '') },
          organizationId: data.orgId,
          source: 'ClipAnalyzeProcessor.process.failure',
          trigger: WorkflowExecutionTrigger.EVENT,
          userId: data.userId,
        })
        .catch((updateError: unknown) => {
          this.logger.error(
            `${this.logContext} failed to persist workflow failure`,
            updateError,
          );
        });
      throw error;
    }
  }

  private async prepareSourceAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PreparedClipAnalysis> {
    const data = this.readJobData(request.input.job);
    const sourceArtifact = data.source?.artifact;
    await this.updateProject(
      data.projectId,
      { progress: 5, status: 'analyzing' },
      data.orgId,
    );
    await this.updateSource(
      data,
      data.source?.kind === 'youtube' ? 'downloading' : 'extracting',
    );
    const sourceUrl = sourceArtifact?.mediaUrl ?? data.youtubeUrl;
    const extraction: AudioExtractionResult =
      data.source?.contentType?.startsWith('audio/')
        ? { audioUrl: sourceUrl }
        : await this.downloadAudio(
            sourceUrl,
            data.orgId,
            data.userId,
            data.projectId,
            data.source?.ingredientId,
            sourceArtifact?.storageKey,
          );
    const resolvedArtifact = extraction.sourceArtifact ?? sourceArtifact;
    if (extraction.sourceArtifact) {
      await this.persistSourceArtifact(data, extraction.sourceArtifact);
    }
    await this.updateProject(data.projectId, { progress: 15 }, data.orgId);
    await this.updateSource(data, 'ready-for-transcription');
    return {
      audioUrl: extraction.audioUrl,
      data,
      sourceArtifact: resolvedArtifact,
      sourceUrl,
    };
  }

  private async transcribeAction(
    request: SystemWorkflowActionRequest,
  ): Promise<TranscribedClipAnalysis> {
    const prepared = this.readPrepared(request.input.prepared);
    const transcription = await this.whisperService.transcribeUrl(
      prepared.audioUrl,
      prepared.data.language,
    );
    await this.updateProject(
      prepared.data.projectId,
      {
        progress: 45,
        transcriptSegments: transcription.segments,
        transcriptSrt: transcription.srt,
        transcriptText: transcription.text,
      },
      prepared.data.orgId,
    );
    await this.updateSource(prepared.data, 'completed');
    return { ...prepared, transcription };
  }

  private async detectHighlightsAction(
    request: SystemWorkflowActionRequest,
  ): Promise<HighlightedClipAnalysis> {
    const transcribed = this.readTranscribed(request.input.transcribed);
    const rawHighlights = await this.highlightDetector.detectHighlights(
      transcribed.transcription.text,
      transcribed.transcription.segments,
      transcribed.data.maxClips,
      {
        fallback: transcribed.data.highlightFallback,
        model: transcribed.data.highlightModel,
      },
    );
    const highlights: IHighlight[] = rawHighlights
      .filter(
        (highlight) =>
          highlight.virality_score >= transcribed.data.minViralityScore,
      )
      .map((highlight) => ({ ...highlight, id: randomUUID() }));
    return { ...transcribed, highlights };
  }

  private async extractReferenceFramesAction(
    request: SystemWorkflowActionRequest,
  ): Promise<ReferencedClipAnalysis> {
    const highlighted = this.readHighlighted(request.input.highlighted);
    const { data, highlights } = highlighted;
    const referenceTimestamps = deriveReferenceTimestamps(highlights);
    let referenceFrames: ClipReferenceFrameSet;
    if (
      referenceTimestamps.length === 0 ||
      data.source?.contentType?.startsWith('audio/')
    ) {
      referenceFrames = unavailableReferenceFrames(
        referenceTimestamps.length === 0
          ? 'clip_reference_no_timestamps'
          : 'clip_reference_audio_source',
        referenceTimestamps.length === 0
          ? 'No eligible highlight timestamps were available for reference extraction.'
          : 'Audio sources do not contain reference frames.',
      );
    } else {
      await this.updateProject(
        data.projectId,
        {
          highlights,
          progress: 75,
          referenceFrames: pendingReferenceFrames(referenceTimestamps),
        },
        data.orgId,
      );
      try {
        referenceFrames = await this.extractReferenceFrames(
          highlighted.sourceArtifact?.mediaUrl ?? highlighted.sourceUrl,
          data.orgId,
          data.userId,
          data.projectId,
          referenceTimestamps,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `${this.logContext} reference extraction unavailable`,
          { error, projectId: data.projectId },
        );
        referenceFrames = unavailableReferenceFrames(
          'clip_reference_extraction_failed',
          'Reference frames could not be extracted from the source video.',
        );
      }
    }
    return { ...highlighted, referenceFrames };
  }

  private async persistAnalysisAction(
    request: SystemWorkflowActionRequest,
  ): Promise<ClipAnalyzeJobResult> {
    const referenced = this.readReferenced(request.input.referenced);
    await this.updateProject(
      referenced.data.projectId,
      {
        highlights: referenced.highlights,
        progress: 100,
        referenceFrames: referenced.referenceFrames,
        status: 'analyzed',
      },
      referenced.data.orgId,
    );
    return { sourceArtifact: referenced.sourceArtifact };
  }

  private async failAnalysisAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ status: 'failed' }> {
    const data = this.readJobData(request.input.job);
    const errorMessage = this.requiredString(
      request.input.errorMessage,
      'errorMessage',
    );
    await this.updateProject(
      data.projectId,
      { error: errorMessage, status: 'failed' },
      data.orgId,
    );
    await this.updateSource(data, 'failed', errorMessage);
    return { status: 'failed' };
  }

  private actionEdge(
    id: string,
    source: string,
    target: string,
    targetHandle: string,
  ) {
    return { id, source, target, targetHandle };
  }

  private actionNode(
    id: string,
    actionId: string,
    label: string,
    inputVariableKeys: string[],
    x: number,
  ) {
    return {
      data: {
        config: { actionId, parameters: {} },
        inputVariableKeys,
        label,
      },
      id,
      position: { x, y: 120 },
      type: 'genfeedAction',
    };
  }

  private readJobData(value: unknown): ClipAnalyzeJobData {
    return this.readRecord(value) as unknown as ClipAnalyzeJobData;
  }

  private readPrepared(value: unknown): PreparedClipAnalysis {
    return this.readRecord(value) as unknown as PreparedClipAnalysis;
  }

  private readTranscribed(value: unknown): TranscribedClipAnalysis {
    return this.readRecord(value) as unknown as TranscribedClipAnalysis;
  }

  private readHighlighted(value: unknown): HighlightedClipAnalysis {
    return this.readRecord(value) as unknown as HighlightedClipAnalysis;
  }

  private readReferenced(value: unknown): ReferencedClipAnalysis {
    return this.readRecord(value) as unknown as ReferencedClipAnalysis;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Missing required clip analysis input: ${field}`);
    }
    return value.trim();
  }

  private async extractReferenceFrames(
    youtubeUrl: string,
    organizationId: string,
    userId: string,
    projectId: string,
    timestamps: number[],
  ): Promise<ClipReferenceFrameSet> {
    const filesUrl = this.getFilesServiceUrl();

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          id: `clip-reference-frames-${projectId}`,
          ingredientId: projectId,
          organizationId,
          params: { inputPath: youtubeUrl, timestamps },
          type: 'extract-reference-frames',
          userId,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const jobId = response.data?.jobId || response.data?.data?.jobId;
    if (!jobId) {
      throw new Error(
        'Files microservice did not return a jobId for reference extraction',
      );
    }

    return this.waitForReferenceFrameJob(filesUrl, jobId);
  }

  /**
   * Download audio from a YouTube URL via the files microservice.
   */
  private async downloadAudio(
    youtubeUrl: string,
    organizationId: string,
    userId: string,
    projectId: string,
    ingredientId?: string,
    sourceS3Key?: string,
  ): Promise<AudioExtractionResult> {
    const filesUrl = this.getFilesServiceUrl();

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          id: `clip-audio-${projectId}`,
          ingredientId: ingredientId ?? projectId,
          organizationId,
          params: sourceS3Key
            ? { s3Key: sourceS3Key }
            : { inputPath: youtubeUrl },
          type: 'video-to-audio',
          userId,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const jobId = response.data?.jobId || response.data?.data?.jobId;

    if (!jobId) {
      throw new Error(
        'Files microservice did not return a jobId for audio extraction',
      );
    }

    return this.waitForAudioJob(filesUrl, jobId);
  }

  private getFilesServiceUrl(): string {
    const configuredFilesUrl = this.configService.get(
      'GENFEEDAI_MICROSERVICES_FILES_URL',
    ) as string | undefined;
    if (!configuredFilesUrl && !this.configService.isDevelopment) {
      throw new Error(
        'GENFEEDAI_MICROSERVICES_FILES_URL is not configured — clip analysis cannot reach the files service',
      );
    }
    return configuredFilesUrl || 'http://localhost:3012';
  }

  /**
   * Poll the files microservice until the audio extraction job completes.
   */
  private async waitForAudioJob(
    filesUrl: string,
    jobId: string,
    timeoutMs = CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  ): Promise<AudioExtractionResult> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );

      const payload = response.data?.data || response.data;
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        const result = payload?.result || payload;
        const audioUrl = result.outputUrl || result.url;
        if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
          throw new Error(
            `Audio extraction job ${jobId} completed without an output URL`,
          );
        }
        const sourceUrl = result.sourceUrl;
        const sourceS3Key = result.sourceS3Key;
        const sourceDurationSeconds = result.sourceDurationSeconds;
        return {
          audioUrl,
          ...(typeof sourceUrl === 'string' && sourceUrl.length > 0
            ? {
                sourceArtifact: {
                  contentType: 'video/mp4',
                  ...(typeof sourceDurationSeconds === 'number' &&
                  Number.isFinite(sourceDurationSeconds)
                    ? { durationSeconds: sourceDurationSeconds }
                    : {}),
                  mediaUrl: sourceUrl,
                  ...(typeof sourceS3Key === 'string' && sourceS3Key.length > 0
                    ? { storageKey: sourceS3Key }
                    : {}),
                },
              }
            : {}),
        };
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(`Audio extraction job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Audio extraction job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  private async waitForReferenceFrameJob(
    filesUrl: string,
    jobId: string,
    timeoutMs = CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
  ): Promise<ClipReferenceFrameSet> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );
      const payload = response.data?.data || response.data;
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        return normalizeClipReferenceFrameSet(payload?.result?.referenceFrames);
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(`Reference extraction job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Reference extraction job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  /**
   * Update clip project fields.
   */
  private async updateProject(
    projectId: string,
    update: Record<string, unknown>,
    organizationId: string,
  ): Promise<void> {
    if (projectId.startsWith(PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX)) {
      const publicUpdate = { ...update };
      if (publicUpdate.status === 'analyzed') {
        publicUpdate.status = 'ready';
      } else if (publicUpdate.status === 'pending') {
        publicUpdate.status = 'queued';
      }
      await this.publicClipToolStore.patchByWorkerProjectId(
        projectId,
        publicUpdate,
      );
      return;
    }
    await this.clipProjectsService.patch(projectId, update, [], organizationId);
  }

  private async updateSource(
    data: ClipAnalyzeJobData,
    status: NonNullable<ClipAnalyzeJobData['source']>['status'],
    errorMessage?: string,
  ): Promise<void> {
    if (!data.source) {
      return;
    }

    const source = {
      ...data.source,
      failure: errorMessage
        ? {
            code: 'clip_source_processing_failed',
            message: errorMessage,
            retryable: true,
          }
        : null,
      status,
      updatedAt: new Date().toISOString(),
    };
    data.source = source;
    await this.updateProject(
      data.projectId,
      {
        source,
      },
      data.orgId,
    );
  }

  private async persistSourceArtifact(
    data: ClipAnalyzeJobData,
    artifact: ClipSourceArtifact,
  ): Promise<void> {
    if (data.source) {
      data.source = {
        ...data.source,
        artifact,
        durationSeconds:
          artifact.durationSeconds ?? data.source.durationSeconds,
      };
    }

    await this.updateProject(
      data.projectId,
      {
        ...(data.projectId.startsWith(PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX)
          ? { sourceArtifact: artifact }
          : {}),
        ...(data.source ? { source: data.source } : {}),
        sourceVideoS3Key: artifact.storageKey,
        sourceVideoUrl: artifact.mediaUrl,
      },
      data.orgId,
    );
  }
}
