import { CreateContentScheduleDto } from '@api/collections/content-schedules/dto/create-content-schedule.dto';
import { UpdateContentScheduleDto } from '@api/collections/content-schedules/dto/update-content-schedule.dto';
import type { ContentScheduleDocument } from '@api/collections/content-schedules/schemas/content-schedule.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { CronJob } from 'cron';

@Injectable()
export class ContentSchedulesService extends BaseService<
  ContentScheduleDocument,
  CreateContentScheduleDto,
  UpdateContentScheduleDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'contentSchedule', logger);
  }

  async createForBrand(
    organizationId: string,
    brandId: string,
    dto: CreateContentScheduleDto,
  ): Promise<ContentScheduleDocument> {
    const now = new Date();
    const timezone = dto.timezone ?? 'UTC';

    return this.delegate.create({
      data: {
        brandId,
        cronExpression: dto.cronExpression,
        isDeleted: false,
        isEnabled: dto.isEnabled ?? true,
        name: dto.name,
        nextRunAt: this.calculateNextRunAt(dto.cronExpression, timezone, now),
        organizationId,
        skillParams: (dto.skillParams ?? {}) as Record<string, unknown>,
        skillSlugs: dto.skillSlugs ?? [],
        timezone,
      } as Record<string, unknown>,
    }) as Promise<ContentScheduleDocument>;
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    isEnabled?: boolean,
  ): Promise<ContentScheduleDocument[]> {
    return this.delegate.findMany({
      where: {
        brandId,
        ...(isEnabled === undefined ? {} : { isEnabled }),
        isDeleted: false,
        organizationId,
      },
    }) as Promise<ContentScheduleDocument[]>;
  }

  async getById(
    organizationId: string,
    brandId: string,
    scheduleId: string,
  ): Promise<ContentScheduleDocument> {
    const schedule = await this.findOne({
      id: scheduleId,
      brandId,
      isDeleted: false,
      organizationId,
    });

    if (!schedule) {
      throw new NotFoundException('ContentSchedule', scheduleId);
    }

    return schedule;
  }

  async updateForBrand(
    organizationId: string,
    brandId: string,
    scheduleId: string,
    dto: UpdateContentScheduleDto,
  ): Promise<ContentScheduleDocument> {
    await this.getById(organizationId, brandId, scheduleId);

    const updatePayload: Record<string, unknown> = { ...dto };
    const expression = dto.cronExpression;
    const timezone = dto.timezone ?? 'UTC';

    if (expression) {
      updatePayload.nextRunAt = this.calculateNextRunAt(
        expression,
        timezone,
        new Date(),
      );
    }

    const updated = await this.delegate.findFirst({
      where: { id: scheduleId, brandId, isDeleted: false, organizationId },
    });

    if (!updated) {
      throw new NotFoundException('ContentSchedule', scheduleId);
    }

    return this.delegate.update({
      where: { id: scheduleId },
      data: updatePayload,
    }) as Promise<ContentScheduleDocument>;
  }

  async removeForBrand(
    organizationId: string,
    brandId: string,
    scheduleId: string,
  ): Promise<ContentScheduleDocument> {
    const existing = await this.delegate.findFirst({
      where: { id: scheduleId, brandId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentSchedule', scheduleId);
    }

    return this.delegate.update({
      where: { id: scheduleId },
      data: { isDeleted: true },
    }) as Promise<ContentScheduleDocument>;
  }

  getActiveSchedules(
    now: Date = new Date(),
  ): Promise<ContentScheduleDocument[]> {
    return this.delegate.findMany({
      where: {
        isDeleted: false,
        isEnabled: true,
        nextRunAt: { lte: now },
        organizationId: { not: null },
      },
    }) as Promise<ContentScheduleDocument[]>;
  }

  async markScheduleRan(
    scheduleId: string,
    organizationId: string,
    nextRunAt: Date,
    lastRunAt: Date,
  ): Promise<void> {
    const existing = await this.delegate.findFirst({
      where: { id: scheduleId, isDeleted: false, organizationId },
    });

    if (!existing) return;

    await this.delegate.update({
      where: { id: scheduleId },
      data: { lastRunAt, nextRunAt },
    });
  }

  calculateNextRunAt(
    cronExpression: string,
    timezone: string,
    now: Date,
  ): Date {
    const job = new CronJob(
      cronExpression,
      () => undefined,
      null,
      false,
      timezone,
    );
    const next = job.nextDate();

    if (!next || typeof next.toJSDate !== 'function') {
      return new Date(now.getTime() + 60_000);
    }

    return next.toJSDate();
  }
}
