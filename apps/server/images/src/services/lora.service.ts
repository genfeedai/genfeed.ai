import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@images/config/config.service';
import type {
  LoraInfo,
  LoraListResult,
  LoraUploadRequest,
  LoraUploadResult,
} from '@images/interfaces/lora.interfaces';
import { S3Service } from '@images/services/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

const SAFETENSORS_EXT = '.safetensors';
const S3_LORA_PREFIX = 'trainings/loras/';

@Injectable()
export class LoraService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
  ) {}

  async uploadLora(request: LoraUploadRequest): Promise<LoraUploadResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!request.loraName || !request.localPath) {
      throw new BadRequestException('loraName and localPath are required');
    }

    if (!request.localPath.endsWith(SAFETENSORS_EXT)) {
      throw new BadRequestException(
        'localPath must point to a .safetensors file',
      );
    }

    try {
      await stat(request.localPath);
    } catch {
      throw new NotFoundException(`Local file not found: ${request.localPath}`);
    }

    const s3Key = `${S3_LORA_PREFIX}${request.loraName}${SAFETENSORS_EXT}`;
    const bucket = this.configService.AWS_S3_BUCKET;

    this.loggerService.log(caller, {
      bucket,
      localPath: request.localPath,
      loraName: request.loraName,
      message: 'Uploading LoRA to S3',
      s3Key,
    });

    await this.s3Service.uploadFile(bucket, s3Key, request.localPath);

    this.loggerService.log(caller, {
      loraName: request.loraName,
      message: 'LoRA uploaded successfully',
      s3Key,
    });

    return {
      loraName: request.loraName,
      s3Key,
      uploaded: true,
    };
  }

  async listLoras(): Promise<LoraListResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const loraMap = new Map<string, LoraInfo>();

    // List local LoRAs from ComfyUI models directory
    await this.listLocalLoras(loraMap);

    // List S3 LoRAs
    await this.listS3Loras(loraMap);

    const loras = Array.from(loraMap.values());

    this.loggerService.log(caller, {
      message: 'LoRAs listed',
      total: loras.length,
    });

    return {
      loras,
      total: loras.length,
    };
  }

  private async listLocalLoras(loraMap: Map<string, LoraInfo>): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const lorasPath = this.configService.COMFYUI_LORAS_PATH;

    try {
      const files = await readdir(lorasPath);

      for (const file of files) {
        if (!file.endsWith(SAFETENSORS_EXT)) {
          continue;
        }

        const name = file.replace(SAFETENSORS_EXT, '');
        const filePath = join(lorasPath, file);

        try {
          const fileStat = await stat(filePath);
          loraMap.set(name, {
            filename: file,
            lastModified: fileStat.mtime.toISOString(),
            name,
            path: filePath,
            sizeBytes: fileStat.size,
            source: 'local',
          });
        } catch (error: unknown) {
          this.loggerService.warn(caller, {
            error: error instanceof Error ? error.message : String(error),
            file,
            message: 'Failed to stat local LoRA file',
          });
        }
      }
    } catch (error: unknown) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        lorasPath,
        message: 'Failed to read local LoRA directory',
      });
    }
  }

  private async listS3Loras(loraMap: Map<string, LoraInfo>): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const bucket = this.configService.AWS_S3_BUCKET;

    try {
      const objects = await this.s3Service.listObjects(bucket, S3_LORA_PREFIX);

      for (const obj of objects) {
        const filename = obj.key.replace(S3_LORA_PREFIX, '');
        if (!filename.endsWith(SAFETENSORS_EXT)) {
          continue;
        }

        const name = filename.replace(SAFETENSORS_EXT, '');

        // Only add from S3 if not already found locally
        if (!loraMap.has(name)) {
          loraMap.set(name, {
            filename,
            lastModified: obj.lastModified,
            name,
            s3Key: obj.key,
            sizeBytes: obj.size,
            source: 's3',
          });
        }
      }
    } catch (error: unknown) {
      this.loggerService.warn(caller, {
        bucket,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to list S3 LoRAs',
      });
    }
  }
}
