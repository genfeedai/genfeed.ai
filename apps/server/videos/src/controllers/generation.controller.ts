import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '@videos/guards/internal-api-key.guard';
import { GenerationService } from '@videos/services/generation.service';
import { JobService } from '@videos/services/job.service';

@ApiTags('Generation')
@Controller('generate')
@UseGuards(InternalApiKeyGuard)
export class GenerationController {
  constructor(
    private readonly generationService: GenerationService,
    private readonly jobService: JobService,
  ) {}

  @Post('video')
  @ApiOperation({ summary: 'Generate video (text-to-video or image-to-video)' })
  generateVideo(
    @Body()
    body: {
      prompt: string;
      negativePrompt?: string;
      model?: string;
      sourceImageUrl?: string;
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
    },
  ) {
    return this.generationService.generateVideo(body);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll video generation job status' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.jobService.getJob(jobId);
  }
}
