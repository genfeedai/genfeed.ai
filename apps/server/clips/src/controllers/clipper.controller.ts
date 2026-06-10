import { ConfigService } from '@clips/config/config.service';
import {
  CreateProjectDto,
  RetryProjectDto,
} from '@clips/controllers/dto/create-project.dto';
import { InternalApiKeyGuard } from '@clips/guards/internal-api-key.guard';
import { ClipperQueueService } from '@clips/queues/clipper-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

function unwrapData<T>(value: T): T {
  let current = value as unknown;
  while (
    current &&
    typeof current === 'object' &&
    'data' in current &&
    Object.keys(current).length === 1
  ) {
    current = (current as { data: unknown }).data;
  }
  return current as T;
}

// Route prefix is 'clips' — main.ts applies the global 'v1' prefix; the old
// 'v1/clips' value double-prefixed every route to /v1/v1/clips/*.
@UseGuards(InternalApiKeyGuard)
@Controller('clips')
export class ClipperController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly clipperQueueService: ClipperQueueService,
  ) {}

  @Post('projects')
  async createProject(@Body() body: CreateProjectDto) {
    const methodName = `${this.constructorName}.createProject`;
    this.logger.log(`${methodName} Starting for video: ${body.videoUrl}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.API_URL}/v1/clip-projects`,
          {
            name: body.name || '',
            organization: body.organizationId,
            settings: body.settings || {},
            sourceVideoUrl: body.videoUrl,
            user: body.userId,
          },
          {
            headers: {
              Authorization: `Bearer ${this.configService.API_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const project = response.data;

      await this.clipperQueueService.addProcessJob(
        project._id || project.data?._id,
        body.userId,
        body.organizationId,
      );

      this.logger.log(
        `${methodName} Project created and queued: ${project._id || project.data?._id}`,
      );

      return {
        data: project.data || project,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  @Get('projects/:id/status')
  async getProjectStatus(@Param('id') id: string) {
    const methodName = `${this.constructorName}.getProjectStatus`;

    try {
      const [projectRes, clipsRes] = await Promise.all([
        firstValueFrom(
          this.httpService.get(
            `${this.configService.API_URL}/v1/clip-projects/${id}`,
            {
              headers: {
                Authorization: `Bearer ${this.configService.API_KEY}`,
              },
            },
          ),
        ),
        firstValueFrom(
          this.httpService.get(
            `${this.configService.API_URL}/v1/clip-results?project=${id}`,
            {
              headers: {
                Authorization: `Bearer ${this.configService.API_KEY}`,
              },
            },
          ),
        ),
      ]);

      return {
        data: {
          clips: unwrapData(clipsRes.data),
          project: unwrapData(projectRes.data),
        },
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed for project ${id}`, error);
      throw error;
    }
  }

  @Post('projects/:id/retry')
  async retryProject(@Param('id') id: string, @Body() body: RetryProjectDto) {
    const methodName = `${this.constructorName}.retryProject`;
    this.logger.log(`${methodName} Retrying project: ${id}`);

    try {
      await this.clipperQueueService.addRetryJob(
        id,
        body.userId,
        body.organizationId,
      );

      return { message: 'Retry queued', success: true };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }
}
