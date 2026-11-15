import { randomUUID } from 'node:crypto';
import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Where the files service stores a thumbnail generated under a given id. */
const THUMBNAIL_STORAGE_PREFIX = 'ingredients/thumbnails/';
const FRAME_WIDTH = 512;
/** A seek to the exact end of a file often yields no frame. */
const LAST_FRAME_INSET_SECONDS = 0.1;
/**
 * The files client gives up on a frame after 30s, but the files service may
 * still finish and upload it afterwards, past the cleanup. A failed sample
 * sweeps its keys again after this grace period; the bucket lifecycle rule on
 * the evaluation-frame prefix is the durable backstop if the sweep is lost.
 */
const LATE_FRAME_SWEEP_DELAY_MS = 5 * 60 * 1000;

/** First, middle and last frame: the least a score may look at. */
export const FIRST_MIDDLE_LAST_POSITIONS: readonly number[] = [0, 0.5, 1];

export interface SampledVideoFrame {
  /** Signed CDN URL the model provider can fetch. */
  url: string;
  /** Position in the video, 0 (first frame) to 1 (last frame). */
  position: number;
  /** Seek time in seconds. */
  seconds: number;
}

export interface VideoFrameSample {
  frames: SampledVideoFrame[];
  /** Deletes the transient frames; a failed delete is logged, never thrown. */
  cleanup: () => Promise<void>;
}

/**
 * Pulls still frames out of a stored video through the files service so a
 * vision model can look at it. Frames are transient: callers must call
 * `cleanup` once the model has answered.
 */
@Traced()
@Injectable()
export class VideoFrameSamplerService {
  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly mediaUrlService: MediaUrlService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Frames at the given positions (0 = first frame, 1 = last frame). Each
   * frame gets its own thumbnail id so it never overwrites the video's own
   * thumbnail; its storage key is recorded before extraction so a partial
   * sample is still cleaned up.
   */
  async sample(
    videoUrl: string,
    positions: readonly number[],
    storedDuration?: number,
  ): Promise<VideoFrameSample> {
    const storageKeys: string[] = [];
    const cleanup = () => this.deleteFrames(storageKeys);
    try {
      // The probe downloads the whole file (capped), so the stored duration
      // wins whenever the video has one.
      const duration =
        storedDuration && Number.isFinite(storedDuration) && storedDuration > 0
          ? storedDuration
          : (await this.filesClientService.extractMetadataFromUrl(videoUrl))
              .duration;
      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        throw new Error('Video duration could not be read');
      }
      const frames: SampledVideoFrame[] = [];
      for (const position of positions) {
        const seconds = this.resolveSeconds(duration, position);
        const frameId = `evaluation-frame-${randomUUID()}`;
        storageKeys.push(`${THUMBNAIL_STORAGE_PREFIX}${frameId}`);
        const { thumbnailUrl } =
          (await this.filesClientService.generateThumbnail(
            videoUrl,
            frameId,
            seconds,
            FRAME_WIDTH,
          )) as { thumbnailUrl?: unknown };
        if (typeof thumbnailUrl !== 'string' || !thumbnailUrl) {
          throw new Error('Frame extraction returned no image');
        }
        frames.push({
          position,
          seconds,
          url: this.mediaUrlService.buildUrlFromAbsolute(thumbnailUrl),
        });
      }
      return { cleanup, frames };
    } catch (error: unknown) {
      this.logger.error('Video frame sampling failed', { error });
      await cleanup();
      this.scheduleLateSweep(storageKeys);
      throw new ExternalServiceException(
        'Files',
        'Video frame sampling failed',
        error,
      );
    }
  }

  private resolveSeconds(duration: number, position: number): number {
    const clamped = Math.min(1, Math.max(0, position));
    if (clamped >= 1) {
      return Math.max(0, duration - LAST_FRAME_INSET_SECONDS);
    }
    return duration * clamped;
  }

  /**
   * A failed sample can leave a frame upload still in flight (the client
   * timed out, the files service did not). Delete the keys once more after a
   * grace period so a late upload does not outlive the evaluation.
   */
  private scheduleLateSweep(storageKeys: readonly string[]) {
    if (storageKeys.length === 0) {
      return;
    }
    const keys = [...storageKeys];
    setTimeout(() => {
      void this.deleteFrames(keys);
    }, LATE_FRAME_SWEEP_DELAY_MS).unref();
  }

  private async deleteFrames(storageKeys: readonly string[]) {
    await Promise.all(
      storageKeys.map(async (storageKey) => {
        try {
          await this.filesClientService.deleteStoredObject(storageKey);
        } catch (error: unknown) {
          this.logger.warn('Evaluation frame cleanup failed', {
            error,
            storageKey,
          });
        }
      }),
    );
  }
}
