import process from 'node:process';
import { JobService } from '@images/services/job.service';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  async getHealth() {
    const mem = process.memoryUsage();

    return {
      jobs: await this.jobService.getStats(),
      memory: {
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        rss: mem.rss,
      },
      service: 'images',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
