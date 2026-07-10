import { CreateContentScheduleDto } from '@api/collections/content-schedules/dto/create-content-schedule.dto';
import { UpdateContentScheduleDto } from '@api/collections/content-schedules/dto/update-content-schedule.dto';
import type { ContentScheduleDocument } from '@api/collections/content-schedules/schemas/content-schedule.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CronJob } from 'cron';

@Injectable()
export class ContentSchedulesService extends BaseService<
  ContentScheduleDocument,
  CreateContentScheduleDto,
  UpdateContentScheduleDto,
  Prisma.ContentScheduleWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    @Optional() private readonly moduleRef?: ModuleRef,
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

    const created = (await this.delegate.create({
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
    })) as ContentScheduleDocument;

    await this.syncWorkflowForSchedule(organizationId, created.id);

    return created;
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
    const existingSchedule = await this.getById(
      organizationId,
      brandId,
      scheduleId,
    );

    const updatePayload: Record<string, unknown> = { ...dto };
    const expression = dto.cronExpression;
    const timezone = dto.timezone ?? existingSchedule.timezone ?? 'UTC';

    if (expression) {
      updatePayload.nextRunAt = this.calculateNextRunAt(
        expression,
        timezone,
        new Date(),
      );
    }

    await findOrThrow(
      this.delegate,
      {
        where: { id: scheduleId, brandId, isDeleted: false, organizationId },
      },
      'ContentSchedule',
      scheduleId,
    );

    const updatedSchedule = (await this.delegate.update({
      where: { id: scheduleId },
      data: updatePayload,
    })) as ContentScheduleDocument;

    await this.syncWorkflowForSchedule(organizationId, updatedSchedule.id);

    return updatedSchedule;
  }

  async removeForBrand(
    organizationId: string,
    brandId: string,
    scheduleId: string,
  ): Promise<ContentScheduleDocument> {
    await findOrThrow(
      this.delegate,
      {
        where: { id: scheduleId, brandId, isDeleted: false, organizationId },
      },
      'ContentSchedule',
      scheduleId,
    );

    const removed = (await this.delegate.update({
      where: { id: scheduleId },
      data: { isDeleted: true },
    })) as ContentScheduleDocument;

    await this.disableWorkflowForSchedule(organizationId, removed.id);

    return removed;
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

  private async syncWorkflowForSchedule(
    organizationId: string,
    scheduleId: string,
  ): Promise<void> {
    const workflowSeeder = await this.getWorkflowTemplateSeeder();
    if (!workflowSeeder) {
      return;
    }

    const userId = await this.getOrganizationOwnerUserId(organizationId);
    if (!userId) {
      this.logger.warn('Skipping content schedule workflow sync - no owner', {
        organizationId,
        scheduleId,
      });
      return;
    }

    await workflowSeeder.ensureContentScheduleWorkflow(
      userId,
      organizationId,
      scheduleId,
    );
  }

  private async disableWorkflowForSchedule(
    organizationId: string,
    scheduleId: string,
  ): Promise<void> {
    const workflowSeeder = await this.getWorkflowTemplateSeeder();
    if (!workflowSeeder) {
      return;
    }

    await workflowSeeder.disableContentScheduleWorkflow(
      organizationId,
      scheduleId,
    );
  }

  private async getOrganizationOwnerUserId(
    organizationId: string,
  ): Promise<string | undefined> {
    const organization = await this.prisma.organization.findFirst({
      select: { userId: true },
      where: { id: organizationId, isDeleted: false },
    });

    return organization?.userId ?? undefined;
  }

  private async getWorkflowTemplateSeeder(): Promise<
    | {
        disableContentScheduleWorkflow: (
          organizationId: string,
          contentScheduleId: string,
        ) => Promise<void>;
        ensureContentScheduleWorkflow: (
          userId: string,
          organizationId: string,
          contentScheduleId: string,
        ) => Promise<void>;
      }
    | undefined
  > {
    if (!this.moduleRef) {
      return undefined;
    }

    const { WorkflowTemplateSeederService } = await import(
      '../../workflows/services/workflow-template-seeder.service'
    );
    return this.moduleRef.get(WorkflowTemplateSeederService, {
      strict: false,
    });
  }
}
