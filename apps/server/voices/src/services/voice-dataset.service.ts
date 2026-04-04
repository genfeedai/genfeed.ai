import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';
import type {
  VoiceDatasetInfo,
  VoiceDatasetSyncRequest,
  VoiceDatasetSyncResult,
} from '@voices/interfaces/voice-dataset.interfaces';
import { S3Service } from '@voices/services/s3.service';

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  '.wma',
  '.opus',
]);

@Injectable()
export class VoiceDatasetService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
  ) {}

  private getDatasetPath(voiceId: string): string {
    return join(this.configService.DATASETS_PATH, 'voices', voiceId);
  }

  private isValidVoiceId(voiceId: string): boolean {
    return /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/.test(voiceId);
  }

  private isAllowedAudioFile(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return ALLOWED_AUDIO_EXTENSIONS.has(ext);
  }

  async syncFromS3(
    voiceId: string,
    request: VoiceDatasetSyncRequest,
  ): Promise<VoiceDatasetSyncResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidVoiceId(voiceId)) {
      throw new BadRequestException(
        `Invalid voice ID: "${voiceId}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    if (!request.s3Keys || request.s3Keys.length === 0) {
      throw new BadRequestException('s3Keys array must not be empty');
    }

    const bucket = request.bucket || this.configService.AWS_S3_BUCKET;
    const datasetPath = this.getDatasetPath(voiceId);

    this.loggerService.log(caller, {
      bucket,
      datasetPath,
      keyCount: request.s3Keys.length,
      message: 'Starting voice dataset sync',
      voiceId,
    });

    await mkdir(datasetPath, { recursive: true });

    let downloaded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const key of request.s3Keys) {
      const filename = basename(key);

      if (!this.isAllowedAudioFile(filename)) {
        errors.push(`Skipped non-audio file: ${key}`);
        failed++;
        continue;
      }

      const localPath = join(datasetPath, filename);

      try {
        await this.s3Service.downloadFile(bucket, key, localPath);
        downloaded++;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Failed to download ${key}: ${errorMessage}`);
        failed++;

        this.loggerService.warn(caller, {
          error: errorMessage,
          key,
          message: 'Failed to download S3 object',
        });
      }
    }

    this.loggerService.log(caller, {
      downloaded,
      failed,
      message: 'Voice dataset sync completed',
      voiceId,
    });

    return {
      downloaded,
      errors,
      failed,
      path: datasetPath,
      voiceId,
    };
  }

  async getDatasetInfo(voiceId: string): Promise<VoiceDatasetInfo> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidVoiceId(voiceId)) {
      throw new BadRequestException(
        `Invalid voice ID: "${voiceId}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    const datasetPath = this.getDatasetPath(voiceId);

    try {
      const dirStat = await stat(datasetPath);
      if (!dirStat.isDirectory()) {
        throw new NotFoundException(`Voice dataset "${voiceId}" not found`);
      }
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        (error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT')
      ) {
        throw new NotFoundException(`Voice dataset "${voiceId}" not found`);
      }
      throw error;
    }

    const files = await readdir(datasetPath);
    const samples = files.filter((f) => this.isAllowedAudioFile(f));

    this.loggerService.log(caller, {
      message: 'Voice dataset info retrieved',
      sampleCount: samples.length,
      voiceId,
    });

    return {
      path: datasetPath,
      sampleCount: samples.length,
      samples,
      totalDurationMs: 0,
      voiceId,
    };
  }

  async deleteDataset(
    voiceId: string,
  ): Promise<{ voiceId: string; deleted: boolean }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidVoiceId(voiceId)) {
      throw new BadRequestException(
        `Invalid voice ID: "${voiceId}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    const datasetPath = this.getDatasetPath(voiceId);

    try {
      await stat(datasetPath);
    } catch {
      throw new NotFoundException(`Voice dataset "${voiceId}" not found`);
    }

    await rm(datasetPath, { force: true, recursive: true });

    this.loggerService.log(caller, {
      datasetPath,
      message: 'Voice dataset deleted',
      voiceId,
    });

    return { deleted: true, voiceId };
  }
}
