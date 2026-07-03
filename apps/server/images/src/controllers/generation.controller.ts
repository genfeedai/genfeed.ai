import { GenerationRateLimitGuard } from '@images/guards/generation-rate-limit.guard';
import { InternalApiKeyGuard } from '@images/guards/internal-api-key.guard';
import type {
  GenerateImageRequest,
  GeneratePulidRequest,
} from '@images/interfaces/images.interfaces';
import { GenerationService } from '@images/services/generation.service';
import { JobService } from '@images/services/job.service';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Generation')
@UseGuards(InternalApiKeyGuard)
@Controller('generate')
export class GenerationController {
  constructor(
    private readonly generationService: GenerationService,
    private readonly jobService: JobService,
  ) {}

  @Post('image')
  @UseGuards(GenerationRateLimitGuard)
  @ApiOperation({ summary: 'Queue image generation' })
  generateImage(@Body() body: GenerateImageRequest) {
    return this.generationService.generateImage(body);
  }

  @Post('pulid')
  @UseGuards(GenerationRateLimitGuard)
  @ApiOperation({ summary: 'PuLID face-consistent generation' })
  generatePulid(@Body() body: GeneratePulidRequest) {
    return this.generationService.generatePulid(body);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll job status' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.jobService.getJob(jobId);
  }
}
