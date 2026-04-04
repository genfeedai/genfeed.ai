import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobService } from '@voices/services/job.service';
import { TTSService } from '@voices/services/tts.service';

@ApiTags('TTS')
@Controller('tts')
export class TTSController {
  constructor(
    private readonly ttsService: TTSService,
    private readonly jobService: JobService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate speech from text' })
  generate(
    @Body()
    body: { text: string; voiceId?: string; language?: string; speed?: number },
  ) {
    return this.ttsService.generate(body);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll TTS job status' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.jobService.getJob(jobId);
  }
}
