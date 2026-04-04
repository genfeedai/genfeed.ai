import { GenerationService } from '@images/services/generation.service';
import { JobService } from '@images/services/job.service';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Generation')
@Controller('generate')
export class GenerationController {
  constructor(
    private readonly generationService: GenerationService,
    private readonly jobService: JobService,
  ) {}

  @Post('image')
  @ApiOperation({ summary: 'Queue image generation' })
  generateImage(
    @Body()
    body: {
      prompt: string;
      negativePrompt?: string;
      model?: string;
      width?: number;
      height?: number;
      seed?: number;
      lora?: string;
    },
  ) {
    return this.generationService.generateImage(body);
  }

  @Post('pulid')
  @ApiOperation({ summary: 'PuLID face-consistent generation' })
  generatePulid(
    @Body()
    body: {
      prompt: string;
      referenceImageUrl: string;
      model?: string;
      width?: number;
      height?: number;
    },
  ) {
    return this.generationService.generatePulid(body);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll job status' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.jobService.getJob(jobId);
  }
}
