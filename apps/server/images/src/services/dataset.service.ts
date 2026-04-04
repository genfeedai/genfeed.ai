import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ConfigService } from '@images/config/config.service';
import type {
  DatasetInfo,
  DatasetSyncRequest,
  DatasetSyncResult,
} from '@images/interfaces/dataset.interfaces';
import { S3Service } from '@images/services/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.txt',
]);

@Injectable()
export class DatasetService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
  ) {}

  private getDatasetPath(slug: string): string {
    return join(this.configService.DATASETS_PATH, slug);
  }

  private isValidSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
  }

  private isAllowedDatasetFile(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return ALLOWED_EXTENSIONS.has(ext);
  }

  async syncDataset(
    slug: string,
    request: DatasetSyncRequest,
  ): Promise<DatasetSyncResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidSlug(slug)) {
      throw new BadRequestException(
        `Invalid dataset slug: "${slug}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    if (!request.s3Keys || request.s3Keys.length === 0) {
      throw new BadRequestException('s3Keys array must not be empty');
    }

    const bucket = request.bucket || this.configService.AWS_S3_BUCKET;
    const datasetPath = this.getDatasetPath(slug);

    this.loggerService.log(caller, {
      bucket,
      datasetPath,
      keyCount: request.s3Keys.length,
      message: 'Starting dataset sync',
      slug,
    });

    await mkdir(datasetPath, { recursive: true });

    let downloaded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const key of request.s3Keys) {
      const filename = basename(key);

      if (!this.isAllowedDatasetFile(filename)) {
        errors.push(`Skipped non-image file: ${key}`);
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
      message: 'Dataset sync completed',
      slug,
    });

    return {
      downloaded,
      errors,
      failed,
      path: datasetPath,
      slug,
    };
  }

  async getDataset(slug: string): Promise<DatasetInfo> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidSlug(slug)) {
      throw new BadRequestException(
        `Invalid dataset slug: "${slug}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    const datasetPath = this.getDatasetPath(slug);

    try {
      const dirStat = await stat(datasetPath);
      if (!dirStat.isDirectory()) {
        throw new NotFoundException(`Dataset "${slug}" not found`);
      }
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        (error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT')
      ) {
        throw new NotFoundException(`Dataset "${slug}" not found`);
      }
      throw error;
    }

    const files = await readdir(datasetPath);
    const images = files.filter((f) =>
      ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'].some((ext) =>
        f.toLowerCase().endsWith(ext),
      ),
    );

    this.loggerService.log(caller, {
      imageCount: images.length,
      message: 'Dataset info retrieved',
      slug,
    });

    return {
      imageCount: images.length,
      images,
      path: datasetPath,
      slug,
    };
  }

  async deleteDataset(
    slug: string,
  ): Promise<{ slug: string; deleted: boolean }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.isValidSlug(slug)) {
      throw new BadRequestException(
        `Invalid dataset slug: "${slug}". Use lowercase alphanumeric characters, hyphens, or underscores.`,
      );
    }

    const datasetPath = this.getDatasetPath(slug);

    try {
      await stat(datasetPath);
    } catch {
      throw new NotFoundException(`Dataset "${slug}" not found`);
    }

    await rm(datasetPath, { force: true, recursive: true });

    this.loggerService.log(caller, {
      datasetPath,
      message: 'Dataset deleted',
      slug,
    });

    return { deleted: true, slug };
  }
}
