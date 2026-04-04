import { ConfigService } from '@images/config/config.service';
import type {
  GenerateImageRequest,
  GeneratePulidRequest,
  GenerationJob,
} from '@images/interfaces/images.interfaces';
import { JobService } from '@images/services/job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly jobService: JobService,
  ) {}

  async generateImage(request: GenerateImageRequest): Promise<GenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { prompt: request.prompt });

    throw new Error(
      'Image generation is not available: ComfyUI WebSocket API integration is not wired. ' +
        'Cannot create orphan jobs that will never execute.',
    );
  }

  async generatePulid(request: GeneratePulidRequest): Promise<GenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { prompt: request.prompt });

    throw new Error(
      'PuLID generation is not available: ComfyUI WebSocket API integration is not wired. ' +
        'Cannot create orphan jobs that will never execute.',
    );
  }
}
