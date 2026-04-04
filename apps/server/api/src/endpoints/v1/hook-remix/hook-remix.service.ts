import { randomUUID } from 'node:crypto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import type {
  CreateBatchHookRemixDto,
  CreateHookRemixDto,
} from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HookRemixService {
  private readonly filesServiceUrl: string;
  private readonly serviceName = this.constructor.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://files.genfeed.ai:3000';
  }

  async createHookRemix(
    dto: CreateHookRemixDto,
    userId: string,
    organizationId: string,
  ) {
    this.loggerService.log('Creating hook remix', this.serviceName, {
      brandId: dto.brandId,
      youtubeUrl: dto.youtubeUrl,
    });

    const ctaIngredient = await this.ingredientsService.findOne({
      _id: new Types.ObjectId(dto.ctaIngredientId),
      brand: new Types.ObjectId(dto.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!ctaIngredient) {
      throw new NotFoundException('CTA ingredient not found');
    }

    if (!ctaIngredient.cdnUrl) {
      throw new BadRequestException('CTA ingredient has no video URL');
    }

    const jobId = randomUUID();
    const hookDuration = dto.hookDurationSeconds ?? 3;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/process/hook-remix`,
          {
            brandId: dto.brandId,
            ctaVideoUrl: ctaIngredient.cdnUrl,
            description: dto.description,
            hookDurationSeconds: hookDuration,
            jobId,
            label: dto.label,
            organizationId,
            userId,
            youtubeUrl: dto.youtubeUrl,
          },
        ),
      );

      return {
        hookDurationSeconds: hookDuration,
        jobId: response.data.jobId || jobId,
        status: 'queued',
        youtubeUrl: dto.youtubeUrl,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to create hook remix',
        error,
        this.serviceName,
      );
      throw error;
    }
  }

  async createBatchHookRemix(
    dto: CreateBatchHookRemixDto,
    userId: string,
    organizationId: string,
  ) {
    this.loggerService.log('Creating batch hook remix', this.serviceName, {
      brandId: dto.brandId,
      count: dto.youtubeUrls.length,
    });

    const ctaIngredient = await this.ingredientsService.findOne({
      _id: new Types.ObjectId(dto.ctaIngredientId),
      brand: new Types.ObjectId(dto.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!ctaIngredient) {
      throw new NotFoundException('CTA ingredient not found');
    }

    if (!ctaIngredient.cdnUrl) {
      throw new BadRequestException('CTA ingredient has no video URL');
    }

    const batchId = randomUUID();
    const hookDuration = dto.hookDurationSeconds ?? 3;

    const jobs = await Promise.all(
      dto.youtubeUrls.map(async (youtubeUrl, index) => {
        const jobId = `${batchId}-${index}`;
        const label = dto.labelPrefix
          ? `${dto.labelPrefix} ${index + 1}`
          : undefined;

        try {
          const response = await firstValueFrom(
            this.httpService.post(
              `${this.filesServiceUrl}/v1/files/process/hook-remix`,
              {
                batchId,
                brandId: dto.brandId,
                ctaVideoUrl: ctaIngredient.cdnUrl,
                hookDurationSeconds: hookDuration,
                jobId,
                label,
                organizationId,
                userId,
                youtubeUrl,
              },
            ),
          );

          return {
            jobId: response.data.jobId || jobId,
            status: 'queued' as const,
            youtubeUrl,
          };
        } catch (error: unknown) {
          this.loggerService.error(
            `Failed to queue hook remix job for ${youtubeUrl}`,
            error,
            this.serviceName,
          );
          return {
            error: error instanceof Error ? error.message : 'Queue failed',
            jobId,
            status: 'failed' as const,
            youtubeUrl,
          };
        }
      }),
    );

    return {
      batchId,
      failed: jobs.filter((j) => j.status === 'failed').length,
      jobs,
      queued: jobs.filter((j) => j.status === 'queued').length,
      total: jobs.length,
    };
  }

  async getJobStatus(jobId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.filesServiceUrl}/v1/files/job/${jobId}`),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to get hook remix job status for ${jobId}`,
        error,
        this.serviceName,
      );
      throw error;
    }
  }
}
