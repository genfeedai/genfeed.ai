import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortraitConversionOptions {
  /** Force the deterministic resize fallback instead of Luma. */
  forceFallback?: boolean;
  /** Luma API timeout in milliseconds. Defaults to 30 000. */
  lumaTimeoutMs?: number;
  /** Maximum allowed duration in seconds. Defaults to 60. */
  maxDurationSeconds?: number;
}

export interface ConversionResult {
  /** URL of the converted portrait video. */
  videoUrl: string;
  /** Method used for the conversion. */
  method: 'luma-reframe' | 'resize-fallback';
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
}

/** Instagram portrait constants. */
export const INSTAGRAM_PORTRAIT = {
  ASPECT: '9:16',
  CODEC: 'h264',
  HEIGHT: 1920,
  MAX_DURATION_SECONDS: 60,
  WIDTH: 1080,
} as const;

const DEFAULT_LUMA_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;
const LUMA_REFRAME_MODEL = 'zsxkib/luma-reframe';
const FALLBACK_JOB_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PortraitConversionService {
  private readonly logContext = 'PortraitConversionService';

  constructor(
    private readonly logger: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly configService: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Convert a video to Instagram portrait format (1080×1920, 9:16, h264).
   *
   * Primary path: Luma reframe API via Replicate.
   * Fallback path: deterministic center-crop resize via files-microservice.
   *
   * Fallback triggers on:
   * - `options.forceFallback === true`
   * - Luma API error
   * - Luma timeout exceeding `options.lumaTimeoutMs` (default 30 s)
   */
  async convertToPortrait(
    videoId: string,
    options?: PortraitConversionOptions,
  ): Promise<ConversionResult> {
    if (!videoId) {
      throw new Error('videoId is required');
    }

    const opts: Required<PortraitConversionOptions> = {
      forceFallback: options?.forceFallback ?? false,
      lumaTimeoutMs: options?.lumaTimeoutMs ?? DEFAULT_LUMA_TIMEOUT_MS,
      maxDurationSeconds:
        options?.maxDurationSeconds ?? INSTAGRAM_PORTRAIT.MAX_DURATION_SECONDS,
    };

    // Fast-path: skip Luma entirely if caller wants the fallback.
    if (opts.forceFallback) {
      this.logger.log(
        `${this.logContext} forceFallback set, using resize path`,
        { videoId },
      );
      return this.resizeFallback(videoId);
    }

    try {
      return await this.lumaReframe(videoId, opts.lumaTimeoutMs);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Luma error';
      this.logger.warn(
        `${this.logContext} Luma reframe failed, falling back to resize`,
        { error: message, videoId },
      );
      return this.resizeFallback(videoId);
    }
  }

  // -------------------------------------------------------------------------
  // Luma reframe path
  // -------------------------------------------------------------------------

  /**
   * Call the Luma reframe model via Replicate to convert the video to 9:16.
   *
   * 1. Resolve a presigned download URL for the video.
   * 2. Create a Replicate prediction for `zsxkib/luma-reframe`.
   * 3. Poll `getPrediction()` every 3 s until succeeded / failed.
   * 4. Throw on timeout so the caller falls back to `resizeFallback`.
   */
  async lumaReframe(
    videoId: string,
    timeoutMs: number,
  ): Promise<ConversionResult> {
    this.logger.log(`${this.logContext} starting Luma reframe`, {
      timeoutMs,
      videoId,
    });

    // 1. Resolve video URL from storage
    const videoUrl = await this.resolveVideoUrl(videoId);

    // 2. Create prediction on Replicate
    const predictionId = await this.replicateService.runModel(
      LUMA_REFRAME_MODEL,
      {
        aspect_ratio: INSTAGRAM_PORTRAIT.ASPECT,
        video_url: videoUrl,
      },
    );

    this.logger.log(`${this.logContext} Luma prediction created`, {
      predictionId,
      videoId,
    });

    // 3. Poll for completion
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const prediction = (await this.replicateService.getPrediction(
        predictionId,
      )) as {
        status: string;
        output?: string | string[];
        error?: string;
      };

      if (prediction.status === 'succeeded') {
        const output = Array.isArray(prediction.output)
          ? prediction.output[0]
          : prediction.output;

        if (!output) {
          throw new Error('Luma reframe succeeded but returned no output URL');
        }

        this.logger.log(`${this.logContext} Luma reframe succeeded`, {
          predictionId,
          videoId,
        });

        return {
          height: INSTAGRAM_PORTRAIT.HEIGHT,
          method: 'luma-reframe',
          videoUrl: output,
          width: INSTAGRAM_PORTRAIT.WIDTH,
        };
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(
          prediction.error ||
            `Luma reframe ${prediction.status} for ${predictionId}`,
        );
      }
    }

    // 4. Timeout
    throw new Error(`Luma reframe timed out after ${timeoutMs}ms`);
  }

  // -------------------------------------------------------------------------
  // Resize fallback path
  // -------------------------------------------------------------------------

  /**
   * Deterministic center-crop and resize to 1080×1920 via files-microservice.
   *
   * Enqueues a CONVERT_TO_PORTRAIT job on the files-microservice and polls
   * until the job completes or times out.
   */
  async resizeFallback(videoId: string): Promise<ConversionResult> {
    this.logger.log(`${this.logContext} using resize fallback`, { videoId });

    // Resolve the video URL so the files-microservice can download it
    const videoUrl = await this.resolveVideoUrl(videoId);

    // Enqueue the portrait conversion job
    const jobResponse = await this.fileQueueService.convertToPortrait(
      videoId,
      videoUrl,
      {
        height: INSTAGRAM_PORTRAIT.HEIGHT,
        width: INSTAGRAM_PORTRAIT.WIDTH,
      },
    );

    this.logger.log(`${this.logContext} portrait job enqueued`, {
      jobId: jobResponse.jobId,
      videoId,
    });

    // Wait for the job to finish
    const result = await this.fileQueueService.waitForJob(
      String(jobResponse.jobId),
      FALLBACK_JOB_TIMEOUT_MS,
    );

    const s3Key = result.s3Key as string | undefined;
    if (!s3Key) {
      throw new Error('Resize fallback completed but returned no s3Key');
    }

    // Build the public CDN URL from the S3 key
    const cdnUrl = `${this.configService.get('GENFEEDAI_CDN_URL')}/${s3Key}`;

    return {
      height: INSTAGRAM_PORTRAIT.HEIGHT,
      method: 'resize-fallback',
      videoUrl: cdnUrl,
      width: INSTAGRAM_PORTRAIT.WIDTH,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a presigned download URL for the given video ID / S3 key.
   */
  private async resolveVideoUrl(videoId: string): Promise<string> {
    return this.filesClientService.getPresignedDownloadUrl(videoId, 'videos');
  }

  /** Promise-based sleep helper. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate that a conversion result meets Instagram portrait requirements.
   */
  validateResult(
    result: ConversionResult,
    _maxDurationSeconds = INSTAGRAM_PORTRAIT.MAX_DURATION_SECONDS,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (result.width !== INSTAGRAM_PORTRAIT.WIDTH) {
      errors.push(
        `Width must be ${INSTAGRAM_PORTRAIT.WIDTH}, got ${result.width}`,
      );
    }
    if (result.height !== INSTAGRAM_PORTRAIT.HEIGHT) {
      errors.push(
        `Height must be ${INSTAGRAM_PORTRAIT.HEIGHT}, got ${result.height}`,
      );
    }
    if (!result.videoUrl) {
      errors.push('videoUrl is required');
    }

    return { errors, valid: errors.length === 0 };
  }
}
