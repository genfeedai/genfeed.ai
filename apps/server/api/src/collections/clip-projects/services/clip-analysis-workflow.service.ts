/**
 * Action executors and queue entry for the clip analysis workflow:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM (GPT-4o)
 * 4. Filter by minViralityScore
 * 5. Extract bounded reference frames from highlight timestamps
 * 6. Save highlights and reference frames (status: 'analyzed')
 *
 * Does not generate clips; generation is a separate workflow.
 */

import { randomUUID } from 'node:crypto';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { IHighlight } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  buildClipAnalysisFailureWorkflowDefinition,
  buildClipAnalysisWorkflowDefinition,
  CLIP_ANALYSIS_ACTION_IDS,
} from '@api/collections/clip-projects/services/clip-analysis-workflow-definition';
import { ClipHighlightDetector } from '@api/collections/clip-projects/services/clip-highlight-detector.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import {
  CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
} from '@genfeedai/contracts/constants';
import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipAnalysisWorkflowInput,
  type ClipAnalysisWorkflowResult,
  type ClipReferenceFrameSet,
  type ClipSourceArtifact,
} from '@genfeedai/contracts/interfaces';
import {
  normalizeClipReferenceFrameSet,
  normalizeClipReferenceTimestamps,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, type OnModuleInit } from '@nestjs/common';
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
type PreparedClipAnalysis = {
  audioUrl: string;
  data: ClipAnalysisWorkflowInput;
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

@Injectable()
export class ClipAnalysisWorkflowService implements OnModuleInit {
  private readonly logContext = 'ClipAnalysisWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipHighlightDetector,
    private readonly publicClipToolStore: PublicClipToolStoreService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
      (request) => this.prepareSourceAction(request),
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.TRANSCRIBE,
      (request) => this.transcribeAction(request),
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
      (request) => this.detectHighlightsAction(request),
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
      (request) => this.extractReferenceFramesAction(request),
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.PERSIST,
      (request) => this.persistAnalysisAction(request),
    );
    this.workflowRunner.registerAction(
      CLIP_ANALYSIS_ACTION_IDS.FAIL,
      (request) => this.failAnalysisAction(request),
    );
    this.workflowRunner.registerWorkflow(buildClipAnalysisWorkflowDefinition());
    this.workflowRunner.registerWorkflow(
      buildClipAnalysisFailureWorkflowDefinition(),
    );
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
      ...(resolvedArtifact ? { sourceArtifact: resolvedArtifact } : {}),
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
  ): Promise<ClipAnalysisWorkflowResult> {
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
    return referenced.sourceArtifact
      ? { sourceArtifact: referenced.sourceArtifact }
      : {};
  }

  private async failAnalysisAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ status: 'failed' }> {
    const data = this.readJobData(request.input.job);
    const errorMessage = this.requiredString(
      request.input.workflowError,
      'workflowError',
    );
    await this.updateProject(
      data.projectId,
      { error: errorMessage, status: 'failed' },
      data.orgId,
    );
    await this.updateSource(data, 'failed', errorMessage);
    return { status: 'failed' };
  }

  private readJobData(value: unknown): ClipAnalysisWorkflowInput {
    return this.readRecord(value) as unknown as ClipAnalysisWorkflowInput;
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
    data: ClipAnalysisWorkflowInput,
    status: NonNullable<ClipAnalysisWorkflowInput['source']>['status'],
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
    data: ClipAnalysisWorkflowInput,
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
