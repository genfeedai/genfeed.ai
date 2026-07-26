import * as fs from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type {
  HookRemixJobData,
  HookRemixResult,
} from '@files/services/hook-remix/hook-remix.interfaces';
import { UploadService } from '@files/services/upload/upload.service';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  assertSafeSegment,
  resolveContainedObjectKey,
  resolveContainedPath,
} from '@libs/security';
import { safeFetch } from '@libs/security/destination-guard';
import { BadRequestException, Injectable } from '@nestjs/common';

const createBadRequest = (message: string) => new BadRequestException(message);

@Injectable()
export class HookRemixService {
  constructor(
    private readonly ytDlpService: YtDlpService,
    private readonly ffmpegService: FFmpegService,
    private readonly uploadService: UploadService,
    private readonly logger: LoggerService,
  ) {}

  async processHookRemix(data: HookRemixJobData): Promise<HookRemixResult> {
    const jobId = assertSafeSegment(data.jobId, 'jobId', createBadRequest);
    const organizationId = assertSafeSegment(
      data.organizationId,
      'organizationId',
      createBadRequest,
    );
    const tempDir = resolveContainedPath(
      path.join(FILES_TMP_ROOT, 'hook-remix'),
      jobId,
      createBadRequest,
    );
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sourcePath = path.join(tempDir, 'source.mp4');
    const hookPath = path.join(tempDir, 'hook.mp4');
    const ctaPath = path.join(tempDir, 'cta.mp4');
    const outputPath = path.join(tempDir, 'output.mp4');

    try {
      // Step 1: Download source video from YouTube
      this.logger.log(`[HookRemix] Downloading video: ${data.youtubeUrl}`);
      await this.ytDlpService.downloadVideo(data.youtubeUrl, sourcePath);

      // Step 2: Trim to hook duration
      this.logger.log(
        `[HookRemix] Trimming to ${data.hookDurationSeconds}s hook`,
      );
      await this.ffmpegService.trimVideo(
        sourcePath,
        hookPath,
        0,
        data.hookDurationSeconds,
      );

      // Step 3: Download CTA clip from CDN
      this.logger.log('[HookRemix] Downloading CTA clip');
      await this.downloadFile(data.ctaVideoUrl, ctaPath);

      // Step 4: Concatenate hook + CTA
      this.logger.log('[HookRemix] Stitching hook + CTA');
      await this.ffmpegService.concatenateVideos(
        [hookPath, ctaPath],
        outputPath,
      );

      // Step 5: Upload to S3
      const s3Key = resolveContainedObjectKey(
        `${organizationId}/hook-remix`,
        `${jobId}.mp4`,
        createBadRequest,
      );
      this.logger.log(`[HookRemix] Uploading to S3: ${s3Key}`);
      const uploadResult = await this.uploadService.uploadToS3(
        s3Key,
        'hook-remix',
        {
          path: outputPath,
          type: 'file',
        },
      );

      this.logger.log(`[HookRemix] Complete: ${uploadResult.publicUrl}`);

      return {
        duration: uploadResult.duration,
        height: uploadResult.height,
        s3Key,
        s3Url: uploadResult.publicUrl,
        size: uploadResult.size,
        success: true,
        width: uploadResult.width,
      };
    } catch (error: unknown) {
      this.logger.error(`[HookRemix] Failed for ${data.youtubeUrl}`, error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      };
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { force: true, recursive: true });
        }
      } catch {
        this.logger.warn(`[HookRemix] Failed to cleanup temp dir: ${tempDir}`);
      }
    }
  }

  private async downloadFile(url: string, outputPath: string): Promise<void> {
    // CTA URLs arrive in job data and are not a configured internal service.
    // Keep the public-network policy fail-closed.
    const response = await safeFetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download CTA clip: ${response.status} ${response.statusText}`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }
}
