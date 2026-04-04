import type { TrainingRequest } from '@images/interfaces/training.interfaces';
import { TrainingService } from '@images/services/training.service';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Training')
@Controller('train')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new LoRA training job' })
  startTraining(@Body() body: TrainingRequest) {
    return this.trainingService.startTraining(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all training jobs' })
  listTrainingJobs() {
    return this.trainingService.listTrainingJobs();
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get training job status' })
  getTrainingJob(@Param('jobId') jobId: string) {
    return this.trainingService.getTrainingJob(jobId);
  }
}
