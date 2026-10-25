import { assertClipperWorkflowActor } from '@api/collections/clipper-projects/services/clipper-workflow-actor.util';
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
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { IHighlight } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import {
  type ClipperAnalysisTranscription,
  readSavedClipTranscription,
} from '@api/collections/clipper-projects/services/clipper-analysis-transcription.util';
import {
  buildClipperAnalysisFailureWorkflowDefinition,
  buildClipperAnalysisWorkflowDefinition,
  CLIPPER_ANALYSIS_ACTION_IDS,
  CLIPPER_ANALYSIS_WORKFLOW_ID,
} from '@api/collections/clipper-projects/services/clipper-analysis-workflow-definition';
import { ClipperHighlightDetector } from '@api/collections/clipper-projects/services/clipper-highlight-detector.service';
import { toClipFailureMessage } from '@api/collections/clipper-projects/services/clipper-source-contract.util';
import { settleClipperWorkflowFailure } from '@api/collections/clipper-projects/services/clipper-workflow-terminal-failure.util';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { PublicClipperToolStoreService } from '@api/services/public-clipper-tool/public-clipper-tool-store.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import {
  CLIPPER_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  CLIPPER_REFERENCE_FRAME_JOB_TIMEOUT_MS,
} from '@genfeedai/contracts/constants';
import {
  CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipperAnalysisWorkflowInput,
  type ClipperAnalysisWorkflowResult,
  type ClipperReferenceFrameSet,
  type ClipperSourceArtifact,
} from '@genfeedai/contracts/interfaces';
import {
  normalizeClipperReferenceFrameSet,
  normalizeClipperReferenceTimestamps,
} from '@genfeedai/helpers';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

function readFileJobStatus(value: unknown): Record<string, unknown> {
  const response = readRecord(value);
  // Files includes the original request in data; state/result belong to the
  // outer status envelope. Also accept transport-wrapped status responses.
  return typeof response.state === 'string' ||
    typeof response.status === 'string'
    ? response
    : readRecord(response.data);
}

/** The files service reports why a job failed; keep it in the error. */
function fileJobFailureReason(payload: Record<string, unknown>): string {
  const reason = payload.failedReason;
  return typeof reason === 'string' && reason.trim()
    ? `: ${reason.trim()}`
    : '';
}

function deriveReferenceTimestamps(highlights: IHighlight[]): number[] {
  return normalizeClipperReferenceTimestamps(
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

function pendingReferenceFrames(
  timestamps: number[],
): ClipperReferenceFrameSet {
  return {
    candidates: timestamps.map((timestampSeconds, index) => ({
      assetId: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      diagnostics: [],
      id: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      status: 'pending',
      timestampSeconds,
    })),
    diagnostics: [],
    schemaVersion: CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'pending',
  };
}

function unavailableReferenceFrames(
  code: string,
  message: string,
): ClipperReferenceFrameSet {
  return {
    candidates: [],
    diagnostics: [{ code, message, severity: 'warning' }],
    schemaVersion: CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'unavailable',
  };
}

interface AudioExtractionResult {
  audioUrl: string;
  sourceArtifact?: ClipperSourceArtifact;
}

const PUBLIC_YOUTUBE_CLIPPER_PROJECT_PREFIX = 'public-youtube-clipper-session-';
type PreparedClipperAnalysis = {
  audioUrl: string;
  data: ClipperAnalysisWorkflowInput;
  sourceArtifact?: ClipperSourceArtifact;
  sourceUrl: string;
  savedTranscription?: ClipperAnalysisTranscription;
};

type TranscribedClipperAnalysis = PreparedClipperAnalysis & {
  transcription: Awaited<ReturnType<WhisperService['transcribeUrl']>>;
};

type HighlightedClipperAnalysis = TranscribedClipperAnalysis & {
  highlights: IHighlight[];
};

type ReferencedClipperAnalysis = HighlightedClipperAnalysis & {
  referenceFrames: ClipperReferenceFrameSet;
};

@Injectable()
export class ClipperAnalysisWorkflowService implements OnModuleInit {
  private readonly logContext = 'ClipperAnalysisWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipperHighlightDetector,
    private readonly publicClipperToolStore: PublicClipperToolStoreService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
      (request) => this.prepareSourceAction(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.TRANSCRIBE,
      (request) => this.transcribeAction(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
      (request) => this.detectHighlightsAction(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
      (request) => this.extractReferenceFramesAction(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.PERSIST,
      (request) => this.persistAnalysisAction(request),
    );
    this.workflowRunner.registerAction(
      CLIPPER_ANALYSIS_ACTION_IDS.FAIL,
      (request) => this.failAnalysisAction(request),
    );
    this.workflowRunner.registerWorkflow(
      buildClipperAnalysisWorkflowDefinition(),
    );
    this.workflowRunner.terminalFailures.register(
      CLIPPER_ANALYSIS_WORKFLOW_ID,
      (request) =>
        settleClipperWorkflowFailure(this.clipperProjectsService, request),
    );
    this.workflowRunner.registerWorkflow(
      buildClipperAnalysisFailureWorkflowDefinition(),
    );
  }

  private async prepareSourceAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PreparedClipperAnalysis> {
    const data = this.readJobData(request.input.job);
    assertClipperWorkflowActor(request, data);
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
    const savedTranscription = await this.readPersistedTranscription(data);
    if (savedTranscription) {
      return {
        audioUrl: sourceUrl,
        data,
        savedTranscription,
        ...(sourceArtifact ? { sourceArtifact } : {}),
        sourceUrl,
      };
    }
    const extraction: AudioExtractionResult =
      data.source?.contentType?.startsWith('audio/')
        ? { audioUrl: sourceUrl }
        : await this.downloadAudio(
            sourceUrl,
            data.orgId,
            data.userId,
            data.projectId,
            // A Library asset is shared across projects, so its audio and any
            // stored copy of its source are keyed by this project instead.
            data.source?.kind === 'library'
              ? undefined
              : data.source?.ingredientId,
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
  ): Promise<TranscribedClipperAnalysis> {
    const prepared = this.readPrepared(request.input.prepared);
    assertClipperWorkflowActor(request, prepared.data);
    const transcription =
      prepared.savedTranscription ??
      (await this.whisperService.transcribeUrl(
        prepared.audioUrl,
        prepared.data.language,
      ));
    await this.updateProject(
      prepared.data.projectId,
      {
        progress: 45,
        transcriptSegments: transcription.segments,
        transcriptSrt: transcription.srt,
        transcriptText: transcription.text,
        ...(prepared.data.source
          ? {
              analysisTranscription: {
                requestedLanguage: prepared.data.language,
                sourceFingerprint: prepared.data.source.fingerprint,
                transcription,
              },
            }
          : {}),
      },
      prepared.data.orgId,
    );
    await this.updateSource(prepared.data, 'completed');
    return { ...prepared, transcription };
  }

  private async detectHighlightsAction(
    request: SystemWorkflowActionRequest,
  ): Promise<HighlightedClipperAnalysis> {
    const transcribed = this.readTranscribed(request.input.transcribed);
    assertClipperWorkflowActor(request, transcribed.data);
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
  ): Promise<ReferencedClipperAnalysis> {
    const highlighted = this.readHighlighted(request.input.highlighted);
    assertClipperWorkflowActor(request, highlighted.data);
    const { data, highlights } = highlighted;
    const referenceTimestamps = deriveReferenceTimestamps(highlights);
    let referenceFrames: ClipperReferenceFrameSet;
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
          highlighted.sourceArtifact?.storageKey,
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
  ): Promise<ClipperAnalysisWorkflowResult> {
    const referenced = this.readReferenced(request.input.referenced);
    assertClipperWorkflowActor(request, referenced.data);
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
    assertClipperWorkflowActor(request, data);
    const errorMessage = this.requiredString(
      request.input.workflowError,
      'workflowError',
    );
    if (!data.projectId.startsWith(PUBLIC_YOUTUBE_CLIPPER_PROJECT_PREFIX)) {
      const project = await this.clipperProjectsService.findOne({
        id: data.projectId,
        isDeleted: false,
        organizationId: data.orgId,
      });
      if (
        project?.source &&
        (data.source
          ? project.source.fingerprint !== data.source.fingerprint ||
            project.source.retryCount !== data.source.retryCount
          : project.source.retryCount > 0)
      ) {
        return { status: 'failed' };
      }
      // The failure graph carries the original queue payload. Keep artifacts
      // materialized by earlier nodes instead of restoring that old snapshot.
      data.source = project?.source ?? data.source;
    }
    const failureMessage = toClipFailureMessage(errorMessage);
    await this.updateProject(
      data.projectId,
      { error: failureMessage, status: 'failed' },
      data.orgId,
    );
    await this.updateSource(data, 'failed', failureMessage);
    return { status: 'failed' };
  }

  private async readPersistedTranscription(
    data: ClipperAnalysisWorkflowInput,
  ): Promise<ClipperAnalysisTranscription | undefined> {
    if (
      !data.source ||
      data.source.retryCount === 0 ||
      data.projectId.startsWith(PUBLIC_YOUTUBE_CLIPPER_PROJECT_PREFIX)
    ) {
      return undefined;
    }
    const project = await this.clipperProjectsService.findOne({
      id: data.projectId,
      isDeleted: false,
      organizationId: data.orgId,
    });
    return readSavedClipTranscription(
      project?.analysisTranscription,
      data.source.fingerprint,
      data.language,
    );
  }

  private readJobData(value: unknown): ClipperAnalysisWorkflowInput {
    return this.readRecord(value) as unknown as ClipperAnalysisWorkflowInput;
  }

  private readPrepared(value: unknown): PreparedClipperAnalysis {
    return this.readRecord(value) as unknown as PreparedClipperAnalysis;
  }

  private readTranscribed(value: unknown): TranscribedClipperAnalysis {
    return this.readRecord(value) as unknown as TranscribedClipperAnalysis;
  }

  private readHighlighted(value: unknown): HighlightedClipperAnalysis {
    return this.readRecord(value) as unknown as HighlightedClipperAnalysis;
  }

  private readReferenced(value: unknown): ReferencedClipperAnalysis {
    return this.readRecord(value) as unknown as ReferencedClipperAnalysis;
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
    sourceS3Key?: string,
  ): Promise<ClipperReferenceFrameSet> {
    const filesUrl = this.getFilesServiceUrl();

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          id: `clipper-reference-frames-${projectId}`,
          ingredientId: projectId,
          organizationId,
          // Stored sources (uploads, Library assets, materialized YouTube
          // downloads) are read by key; the files service only fetches
          // remote URLs from YouTube.
          params: sourceS3Key
            ? { s3Key: sourceS3Key, timestamps }
            : { inputPath: youtubeUrl, timestamps },
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
          // A remote source is stored during extraction so reference frames
          // can later read it by key (provider-hosted Library videos).
          params: sourceS3Key
            ? { s3Key: sourceS3Key }
            : { inputPath: youtubeUrl, materializeSource: true },
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
    timeoutMs = CLIPPER_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  ): Promise<AudioExtractionResult> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${filesUrl}/v1/files/job/${jobId}`),
      );

      const payload = readFileJobStatus(response.data);
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        const result = payload.result ? readRecord(payload.result) : payload;
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
        throw new Error(
          `Audio extraction job ${jobId} failed${fileJobFailureReason(payload)}`,
        );
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
    timeoutMs = CLIPPER_REFERENCE_FRAME_JOB_TIMEOUT_MS,
  ): Promise<ClipperReferenceFrameSet> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${filesUrl}/v1/files/job/${jobId}`),
      );
      const payload = readFileJobStatus(response.data);
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        return normalizeClipperReferenceFrameSet(
          readRecord(payload.result).referenceFrames,
        );
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(
          `Reference extraction job ${jobId} failed${fileJobFailureReason(payload)}`,
        );
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
    if (projectId.startsWith(PUBLIC_YOUTUBE_CLIPPER_PROJECT_PREFIX)) {
      const publicUpdate = { ...update };
      if (publicUpdate.status === 'analyzed') {
        publicUpdate.status = 'ready';
      } else if (publicUpdate.status === 'pending') {
        publicUpdate.status = 'queued';
      }
      await this.publicClipperToolStore.patchByWorkerProjectId(
        projectId,
        publicUpdate,
      );
      return;
    }
    await this.clipperProjectsService.patch(
      projectId,
      update,
      [],
      organizationId,
    );
  }

  private async updateSource(
    data: ClipperAnalysisWorkflowInput,
    status: NonNullable<ClipperAnalysisWorkflowInput['source']>['status'],
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
    data: ClipperAnalysisWorkflowInput,
    artifact: ClipperSourceArtifact,
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
        ...(data.projectId.startsWith(PUBLIC_YOUTUBE_CLIPPER_PROJECT_PREFIX)
          ? { sourceArtifact: artifact }
          : {}),
        ...(data.source ? { source: data.source } : {}),
        sourceVideoS3Key: artifact.storageKey,
        ...(data.source?.kind === 'youtube'
          ? {}
          : { sourceVideoUrl: artifact.mediaUrl }),
      },
      data.orgId,
    );
  }
}
