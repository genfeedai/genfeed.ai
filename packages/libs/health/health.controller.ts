import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  version: string;
  memory?: NodeJS.MemoryUsage;
  uptime?: number;
}

@Controller('health')
export class HealthController {
  private getVersion(): string {
    return process.env.npm_package_version ?? process.env.VERSION ?? '1.0.0';
  }

  private getServiceName(): string {
    return process.env.SERVICE_NAME ?? 'api';
  }

  private buildResponse(status: string): HealthResponse {
    return {
      service: this.getServiceName(),
      status,
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
    };
  }

  @Public()
  @Get()
  check(): HealthResponse {
    return this.buildResponse('ok');
  }

  @Get('detailed')
  detailed(): HealthResponse {
    return {
      ...this.buildResponse('ok'),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('ready')
  ready(): HealthResponse {
    return this.buildResponse('ready');
  }

  @Public()
  @Get('live')
  live(): HealthResponse {
    return this.buildResponse('alive');
  }
}
