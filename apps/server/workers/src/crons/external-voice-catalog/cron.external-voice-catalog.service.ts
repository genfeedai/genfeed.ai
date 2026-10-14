import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronExternalVoiceCatalogService {
  private readonly context = 'CronExternalVoiceCatalogService';

  constructor(
    private readonly externalVoiceCatalog: ExternalVoiceCatalogService,
    private readonly logger: LoggerService,
  ) {}

  async syncFromProviders(): Promise<void> {
    const result = await this.externalVoiceCatalog.syncFromProviders();
    this.logger.log(
      `External voice catalog synced (created=${result.created}, updated=${result.updated})`,
      this.context,
    );
  }
}
