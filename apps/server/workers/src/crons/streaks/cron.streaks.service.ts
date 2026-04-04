import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronStreaksService {
  constructor(
    private readonly logger: LoggerService,
    private readonly streaksService: StreaksService,
  ) {}

  @Cron('30 0 * * *', { timeZone: 'UTC' })
  async processStreaks(): Promise<void> {
    const result = await this.streaksService.processStaleStreaks();

    this.logger.log('CronStreaksService completed', result);
  }
}
