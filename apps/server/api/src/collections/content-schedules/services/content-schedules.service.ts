import { CreateContentScheduleDto } from '@api/collections/content-schedules/dto/create-content-schedule.dto';
import { UpdateContentScheduleDto } from '@api/collections/content-schedules/dto/update-content-schedule.dto';
import {
  ContentSchedule,
  type ContentScheduleDocument,
} from '@api/collections/content-schedules/schemas/content-schedule.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CronJob } from 'cron';
import { Types } from 'mongoose';

@Injectable()
export class ContentSchedulesService extends BaseService<
  ContentScheduleDocument,
  CreateContentScheduleDto,
  UpdateContentScheduleDto
> {
  constructor(
    @InjectModel(ContentSchedule.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ContentScheduleDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  async createForBrand(
    organizationId: string,
    brandId: string,
    dto: CreateContentScheduleDto,
  ): Promise<ContentScheduleDocument> {
    const now = new Date();
    const timezone = dto.timezone ?? 'UTC';

    const schedule = await this.model.create({
      brand: new Types.ObjectId(brandId),
      cronExpression: dto.cronExpression,
      isDeleted: false,
      isEnabled: dto.isEnabled ?? true,
      name: dto.name,
      nextRunAt: this.calculateNextRunAt(dto.cronExpression, timezone, now),
      organization: new Types.ObjectId(organizationId),
      skillParams: dto.skillParams,
      skillSlugs: dto.skillSlugs,
      timezone,
    });

    return schedule;
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    isEnabled?: boolean,
  ): Promise<ContentScheduleDocument[]> {
    return this.find({
      brand: new Types.ObjectId(brandId),
      ...(isEnabled === undefined ? {} : { isEnabled }),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async getById(
    organizationId: string,
    brandId: string,
    scheduleId: string,
  ): Promise<ContentScheduleDocument> {
    const schedule = await this.findOne({
      _id: new Types.ObjectId(scheduleId),
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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

    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(scheduleId),
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: updatePayload },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentSchedule', scheduleId);
    }

    return updated;
  }

  async removeForBrand(
    organizationId: string,
    brandId: string,
    scheduleId: string,
  ): Promise<ContentScheduleDocument> {
    const removed = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(scheduleId),
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: { isDeleted: true } },
      { new: true },
    );

    if (!removed) {
      throw new NotFoundException('ContentSchedule', scheduleId);
    }

    return removed;
  }

  getActiveSchedules(
    now: Date = new Date(),
  ): Promise<ContentScheduleDocument[]> {
    return this.model
      .find({
        isDeleted: false,
        isEnabled: true,
        nextRunAt: { $lte: now },
        organization: { $exists: true },
      })
      .exec();
  }

  async markScheduleRan(
    scheduleId: string,
    organizationId: string,
    nextRunAt: Date,
    lastRunAt: Date,
  ): Promise<void> {
    await this.model.updateOne(
      {
        _id: new Types.ObjectId(scheduleId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          lastRunAt,
          nextRunAt,
        },
      },
    );
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
