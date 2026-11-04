import { Public } from '@libs/decorators/public.decorator';
import { getAppVersion } from '@libs/health/app-version.util';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { Controller, Get, Inject, Optional } from '@nestjs/common';

interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  version: string;
  memory?: NodeJS.MemoryUsage;
  uptime?: number;
  [key: string]: unknown;
}

@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    @Inject(HEALTH_CONTRIBUTOR)
    private readonly contributor?: HealthContributor,
  ) {}

  private getServiceName(): string {
    return process.env.SERVICE_NAME ?? 'api';
  }

  private buildResponse(status: string): HealthResponse {
    return {
      service: this.getServiceName(),
      status,
      timestamp: new Date().toISOString(),
      version: getAppVersion(),
    };
  }

  @Public()
  @Get()
  check(): HealthResponse {
    return this.buildResponse('ok');
  }

  @Get('detailed')
  async detailed(): Promise<HealthResponse> {
    const details = (await this.contributor?.getHealthDetails()) ?? {};

    return {
      ...this.buildResponse('ok'),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      ...details,
    };
  }

  /**
   * Readiness, including any peer dependency the service cannot currently
   * reach. A degraded peer still answers 200 on purpose (#3565): recycling a
   * task that is otherwise serving traffic turns a transient DNS gap into a
   * restart loop. The contributor hook is synchronous and reads cached state,
   * so this probe never issues its own network calls.
   */
  @Public()
  @Get('ready')
  ready(): HealthResponse {
    const readiness = this.contributor?.getReadiness?.();

    if (!readiness) {
      return this.buildResponse('ready');
    }

    const response: HealthResponse = this.buildResponse(readiness.status);

    if (readiness.degradedDependencies?.length) {
      response.degradedDependencies = readiness.degradedDependencies;
    }

    if (readiness.configurationIssues?.length) {
      response.configurationIssues = readiness.configurationIssues;
    }

    return response;
  }

  @Public()
  @Get('live')
  live(): HealthResponse {
    return this.buildResponse('alive');
  }
}
