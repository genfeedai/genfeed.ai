import process from 'node:process';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobService } from '@voices/services/job.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly ttsInferenceService: TTSInferenceService,
    private readonly jobService: JobService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Voices service health' })
  async getHealth() {
    const mem = process.memoryUsage();

    return {
      jobs: await this.jobService.getStats(),
      memory: {
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        rss: mem.rss,
      },
      service: 'voices',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('tts')
  @ApiOperation({ summary: 'TTS inference container health' })
  async ttsHealth() {
    const status = await this.ttsInferenceService.getStatus();
    return {
      service: 'tts-inference',
      ...status,
      timestamp: new Date().toISOString(),
    };
  }
}
