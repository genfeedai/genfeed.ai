import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import type {
  PipelineStep,
  PublishMode,
} from '@api/services/content-orchestration/pipeline.interfaces';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';

interface GenerateAndPublishDto {
  brandId: string;
  steps: PipelineStep[];
  publishMode?: PublishMode;
  idempotencyKey?: string;
  platforms?: string[];
  scheduledDate?: string;
  prompt?: string;
}

interface BatchGenerateDto {
  brandId: string;
  items: Array<{
    steps: PipelineStep[];
    prompt?: string;
    publishMode?: PublishMode;
    scheduledDate?: string;
  }>;
}

@Controller('personas/:personaId/pipeline')
export class ContentOrchestrationController {
  constructor(
    private readonly contentOrchestrationService: ContentOrchestrationService,
    private readonly contentPipelineQueueService: ContentPipelineQueueService,
    private readonly brandsService: BrandsService,
  ) {}

  private async validateBrandOwnership(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      organization: new Types.ObjectId(organizationId),
    });
    if (!brand) {
      throw new ForbiddenException(
        'Brand does not belong to this organization',
      );
    }
  }

  /**
   * Queue a multi-step content generation pipeline.
   * Steps define the generation chain (e.g., T2I → I2V → publish).
   */
  @Post('generate-and-publish')
  async generateAndPublish(
    @Param('personaId') personaId: string,
    @Req() req: { user: { id: string }; organization: { id: string } },
    @Body() dto: GenerateAndPublishDto,
  ) {
    if (!dto.steps || dto.steps.length === 0) {
      throw new BadRequestException('Pipeline must have at least one step');
    }

    await this.validateBrandOwnership(dto.brandId, req.organization.id);

    try {
      this.contentOrchestrationService.validateSteps(dto.steps);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid pipeline steps',
      );
    }

    const jobId =
      await this.contentPipelineQueueService.queueGenerateAndPublish({
        brandId: dto.brandId,
        idempotencyKey: dto.idempotencyKey,
        organizationId: req.organization.id,
        personaId,
        platforms: dto.platforms,
        prompt: dto.prompt,
        publishMode: dto.publishMode,
        scheduledDate: dto.scheduledDate
          ? new Date(dto.scheduledDate)
          : undefined,
        steps: dto.steps,
        userId: req.user.id,
      });

    return { jobId, status: 'queued', stepCount: dto.steps.length };
  }

  /**
   * Queue N content pieces through the pipeline.
   */
  @Post('batch-generate')
  async batchGenerate(
    @Param('personaId') personaId: string,
    @Req() req: { user: { id: string }; organization: { id: string } },
    @Body() dto: BatchGenerateDto,
  ) {
    await this.validateBrandOwnership(dto.brandId, req.organization.id);

    // Validate all items' steps
    for (const item of dto.items) {
      if (!item.steps || item.steps.length === 0) {
        throw new BadRequestException(
          'Each batch item must have at least one step',
        );
      }
      try {
        this.contentOrchestrationService.validateSteps(item.steps);
      } catch (error: unknown) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid pipeline steps',
        );
      }
    }

    const jobId = await this.contentPipelineQueueService.queueBatchGenerate({
      brandId: dto.brandId,
      count: dto.items.length,
      items: dto.items.map((item) => ({
        ...item,
        scheduledDate: item.scheduledDate
          ? new Date(item.scheduledDate)
          : undefined,
      })),
      organizationId: req.organization.id,
      personaId,
      userId: req.user.id,
    });

    return { count: dto.items.length, jobId, status: 'queued' };
  }

  /**
   * Check pipeline job status.
   */
  @Get('status')
  async getPipelineStatus(
    @Param('personaId') personaId: string,
    @Req() req: { organization: { id: string } },
  ) {
    const jobs = await this.contentPipelineQueueService.getJobsByPersona(
      personaId,
      req.organization.id,
    );

    return { jobs, personaId };
  }
}
