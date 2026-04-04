import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';
import type {
  VoiceCloneInfo,
  VoiceCloneListResult,
  VoiceCloneUploadRequest,
  VoiceCloneUploadResult,
} from '@voices/interfaces/voice-clone.interfaces';
import { S3Service } from '@voices/services/s3.service';

const S3_VOICE_CLONE_PREFIX = 'trainings/voice-clones/';
const MODEL_EXTENSIONS = new Set(['.pth', '.onnx', '.bin', '.safetensors']);

@Injectable()
export class VoiceCloneService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
  ) {}

  async uploadClone(
    request: VoiceCloneUploadRequest,
  ): Promise<VoiceCloneUploadResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!request.voiceId || !request.localPath) {
      throw new BadRequestException('voiceId and localPath are required');
    }

    const ext = request.localPath.slice(request.localPath.lastIndexOf('.'));
    if (!MODEL_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `localPath must point to a model file (${Array.from(MODEL_EXTENSIONS).join(', ')})`,
      );
    }

    try {
      await stat(request.localPath);
    } catch {
      throw new NotFoundException(`Local file not found: ${request.localPath}`);
    }

    const filename = request.localPath.slice(
      request.localPath.lastIndexOf('/') + 1,
    );
    const s3Key = `${S3_VOICE_CLONE_PREFIX}${request.voiceId}/${filename}`;
    const bucket = this.configService.AWS_S3_BUCKET;

    this.loggerService.log(caller, {
      bucket,
      localPath: request.localPath,
      message: 'Uploading voice clone to S3',
      s3Key,
      voiceId: request.voiceId,
    });

    await this.s3Service.uploadFile(bucket, s3Key, request.localPath);

    this.loggerService.log(caller, {
      message: 'Voice clone uploaded successfully',
      s3Key,
      voiceId: request.voiceId,
    });

    return {
      s3Key,
      uploaded: true,
      voiceId: request.voiceId,
    };
  }

  async downloadClone(
    voiceId: string,
  ): Promise<{ voiceId: string; path: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!voiceId) {
      throw new BadRequestException('voiceId is required');
    }

    const bucket = this.configService.AWS_S3_BUCKET;
    const prefix = `${S3_VOICE_CLONE_PREFIX}${voiceId}/`;
    const localDir = join(this.configService.VOICE_MODELS_PATH, voiceId);

    this.loggerService.log(caller, {
      bucket,
      message: 'Downloading voice clone from S3',
      prefix,
      voiceId,
    });

    const objects = await this.s3Service.listObjects(bucket, prefix);

    if (objects.length === 0) {
      throw new NotFoundException(
        `No voice clone model found in S3 for voice "${voiceId}"`,
      );
    }

    for (const obj of objects) {
      const filename = obj.key.replace(prefix, '');
      const localPath = join(localDir, filename);
      await this.s3Service.downloadFile(bucket, obj.key, localPath);
    }

    this.loggerService.log(caller, {
      fileCount: objects.length,
      localDir,
      message: 'Voice clone downloaded successfully',
      voiceId,
    });

    return { path: localDir, voiceId };
  }

  async listClones(): Promise<VoiceCloneListResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const cloneMap = new Map<string, VoiceCloneInfo>();

    await this.listLocalClones(cloneMap);
    await this.listS3Clones(cloneMap);

    const clones = Array.from(cloneMap.values());

    this.loggerService.log(caller, {
      message: 'Voice clones listed',
      total: clones.length,
    });

    return {
      clones,
      total: clones.length,
    };
  }

  private async listLocalClones(
    cloneMap: Map<string, VoiceCloneInfo>,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const modelsPath = this.configService.VOICE_MODELS_PATH;

    try {
      const entries = await readdir(modelsPath);

      for (const entry of entries) {
        const entryPath = join(modelsPath, entry);

        try {
          const entryStat = await stat(entryPath);

          if (entryStat.isDirectory()) {
            const files = await readdir(entryPath);
            const modelFile = files.find((f) => {
              const ext = f.slice(f.lastIndexOf('.'));
              return MODEL_EXTENSIONS.has(ext);
            });

            if (modelFile) {
              const modelPath = join(entryPath, modelFile);
              const modelStat = await stat(modelPath);
              cloneMap.set(entry, {
                filename: modelFile,
                lastModified: modelStat.mtime.toISOString(),
                path: modelPath,
                sizeBytes: modelStat.size,
                source: 'local',
                voiceId: entry,
              });
            }
          }
        } catch (error: unknown) {
          this.loggerService.warn(caller, {
            entry,
            error: error instanceof Error ? error.message : String(error),
            message: 'Failed to stat local voice clone entry',
          });
        }
      }
    } catch (error: unknown) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to read local voice models directory',
        modelsPath,
      });
    }
  }

  private async listS3Clones(
    cloneMap: Map<string, VoiceCloneInfo>,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const bucket = this.configService.AWS_S3_BUCKET;

    try {
      const objects = await this.s3Service.listObjects(
        bucket,
        S3_VOICE_CLONE_PREFIX,
      );

      for (const obj of objects) {
        const relativePath = obj.key.replace(S3_VOICE_CLONE_PREFIX, '');
        const parts = relativePath.split('/');

        if (parts.length < 2) {
          continue;
        }

        const voiceId = parts[0];
        const filename = parts.slice(1).join('/');
        const ext = filename.slice(filename.lastIndexOf('.'));

        if (!MODEL_EXTENSIONS.has(ext)) {
          continue;
        }

        if (!cloneMap.has(voiceId)) {
          cloneMap.set(voiceId, {
            filename,
            lastModified: obj.lastModified,
            s3Key: obj.key,
            sizeBytes: obj.size,
            source: 's3',
            voiceId,
          });
        }
      }
    } catch (error: unknown) {
      this.loggerService.warn(caller, {
        bucket,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to list S3 voice clones',
      });
    }
  }
}
