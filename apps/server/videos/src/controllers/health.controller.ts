import { Controller, Get } from '@nestjs/common';
import { JobService } from '@videos/services/job.service';

@Controller('health')
export class HealthController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  getHealth() {
    const mem = process.memoryUsage();

    return {
      jobs: this.jobService.getStats(),
      memory: {
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        rss: mem.rss,
      },
      service: 'videos',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
