import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const LOCK_KEY = 'cron:content-schedules';
const LOCK_TTL_SECONDS = 55;

@Injectable()
export class CronContentSchedulesService {
  constructor(
    private readonly contentSchedulesService: ContentSchedulesService,
    private readonly contentGatewayService: ContentGatewayService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processContentSchedules(): Promise<void> {
    const lockAcquired = await this.cacheService.acquireLock(
      LOCK_KEY,
      LOCK_TTL_SECONDS,
    );

    if (!lockAcquired) {
      return;
    }

    const now = new Date();

    try {
      const schedules =
        await this.contentSchedulesService.getActiveSchedules(now);

      for (const schedule of schedules) {
        try {
          await this.contentGatewayService.routeSignal({
            brandId: schedule.brand.toString(),
            organizationId: schedule.organization.toString(),
            payload: {
              scheduleId: String(schedule._id),
              skillParams: schedule.skillParams ?? {},
              skillSlugs: schedule.skillSlugs,
            },
            type: 'cron',
          });

          const nextRunAt = this.contentSchedulesService.calculateNextRunAt(
            schedule.cronExpression,
            schedule.timezone,
            now,
          );

          await this.contentSchedulesService.markScheduleRan(
            String(schedule._id),
            schedule.organization.toString(),
            nextRunAt,
            now,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed content schedule ${String(schedule._id)}: ${message}`,
            'CronContentSchedulesService',
          );
        }
      }
    } finally {
      await this.cacheService.releaseLock(LOCK_KEY);
    }
  }
}
