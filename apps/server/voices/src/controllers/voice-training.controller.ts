import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { VoiceTrainingRequest } from '@voices/interfaces/voice-training.interfaces';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

@ApiTags('Voice Training')
@Controller('train')
export class VoiceTrainingController {
  constructor(private readonly voiceTrainingService: VoiceTrainingService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new voice training job' })
  startTraining(@Body() body: VoiceTrainingRequest) {
    return this.voiceTrainingService.startTraining(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all voice training jobs' })
  listJobs() {
    return this.voiceTrainingService.listJobs();
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get voice training job status' })
  getJob(@Param('jobId') jobId: string) {
    return this.voiceTrainingService.getJob(jobId);
  }
}
