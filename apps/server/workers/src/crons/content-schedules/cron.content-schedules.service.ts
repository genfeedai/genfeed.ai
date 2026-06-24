import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const LOCK_KEY = 'cron:content-schedules';
const LOCK_TTL_SECONDS = 55;

type LegacyContentSchedule = {
  _id?: unknown;
  brand?: unknown;
  brandId?: string | null;
  cronExpression?: string;
  id?: string;
  organization?: unknown;
  organizationId: string;
  skillParams?: Record<string, unknown>;
  skillSlugs?: string[];
  timezone?: string;
};

@Injectable()
export class CronContentSchedulesService {
  constructor(
    private readonly contentSchedulesService: ContentSchedulesService,
    private readonly contentGatewayService: ContentGatewayService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

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
      const schedules = (await this.contentSchedulesService.getActiveSchedules(
        now,
      )) as unknown as LegacyContentSchedule[];

      for (const schedule of schedules) {
        try {
          const scheduleId = String(schedule._id ?? schedule.id);
          const organizationId = String(
            schedule.organization ?? schedule.organizationId,
          );
          await this.contentGatewayService.routeSignal({
            brandId: String(schedule.brand ?? schedule.brandId),
            organizationId,
            payload: {
              scheduleId,
              skillParams: schedule.skillParams ?? {},
              skillSlugs: schedule.skillSlugs ?? [],
            },
            type: 'cron',
          });

          const nextRunAt = this.contentSchedulesService.calculateNextRunAt(
            schedule.cronExpression ?? '* * * * *',
            schedule.timezone ?? 'UTC',
            now,
          );

          await this.contentSchedulesService.markScheduleRan(
            scheduleId,
            organizationId,
            nextRunAt,
            now,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed content schedule ${String(schedule._id ?? schedule.id)}: ${message}`,
            'CronContentSchedulesService',
          );
        }
      }
    } finally {
      await this.cacheService.releaseLock(LOCK_KEY);
    }
  }
}
