import { ConfigService } from '@images/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ComfyUIService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async getStatus(): Promise<{ status: 'online' | 'offline'; url: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.configService.COMFYUI_URL;

    try {
      await axios.get(url, { timeout: 5000 });
      return { status: 'online', url };
    } catch {
      this.loggerService.warn(caller, { message: 'ComfyUI is offline', url });
      return { status: 'offline', url };
    }
  }

  async restart(): Promise<{ message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { message: 'Restart requested' });

    // Restart is handled via Docker — this endpoint signals the orchestrator
    return { message: 'ComfyUI restart signal sent' };
  }
}
