import { CreateContentPlanDto } from '@api/collections/content-plans/dto/create-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import type { ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ContentPlanStatus } from '@genfeedai/enums';
import type { ContentPlan as PrismaContentPlan } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CreateContentPlanInternal {
  organizationId: string;
  brandId: string;
  createdBy: string;
  name: string;
  description?: string;
  status: ContentPlanStatus;
  periodStart: Date;
  periodEnd: Date;
  itemCount: number;
  isDeleted: boolean;
}

interface ContentPlanConfigInput {
  description?: string;
  executedCount?: number;
  itemCount?: number;
  name?: string;
  periodEnd?: Date | string;
  periodStart?: Date | string;
  status?: ContentPlanStatus;
}

@Injectable()
export class ContentPlansService extends BaseService<
  ContentPlanDocument,
  CreateContentPlanDto,
  UpdateContentPlanDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'contentPlan', logger);
  }

  async createInternal(
    input: CreateContentPlanInternal,
  ): Promise<ContentPlanDocument> {
    const created = (await this.delegate.create({
      data: {
        brandId: input.brandId,
        createdById: input.createdBy,
        isDeleted: input.isDeleted,
        label: input.name,
        organizationId: input.organizationId,
        config: this.buildConfigPayload(
          {
            description: input.description,
            executedCount: 0,
            itemCount: input.itemCount,
            name: input.name,
            periodEnd: input.periodEnd,
            periodStart: input.periodStart,
            status: input.status,
          },
          undefined,
        ) as never,
      },
    })) as PrismaContentPlan;

    return this.toDocument(created);
  }

  async listByBrand(
    organizationId: string,
    brandId: string,
  ): Promise<ContentPlanDocument[]> {
    const docs = (await this.delegate.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
      },
    })) as PrismaContentPlan[];

    return docs.map((doc) => this.toDocument(doc));
  }

  async getByIdOrFail(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const plan = (await this.delegate.findFirst({
      where: {
        id: planId,
        isDeleted: false,
        organizationId,
      },
    })) as PrismaContentPlan | null;

    if (!plan) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return this.toDocument(plan);
  }

  async patch(
    id: string,
    updateDto: UpdateContentPlanDto & {
      organization?: string;
      organizationId?: string;
    },
  ): Promise<ContentPlanDocument> {
    const organizationId = updateDto.organizationId ?? updateDto.organization;
    const existing = (await this.delegate.findFirst({
      where: {
        id,
        isDeleted: false,
        ...(organizationId ? { organizationId } : {}),
      },
    })) as PrismaContentPlan | null;

    if (!existing) {
      throw new NotFoundException('ContentPlan', id);
    }

    const updated = (await this.delegate.update({
      data: {
        ...(updateDto.name !== undefined ? { label: updateDto.name } : {}),
        config: this.buildConfigPayload(updateDto, existing.config) as never,
      },
      where: { id },
    })) as PrismaContentPlan;

    return this.toDocument(updated);
  }

  async updateStatus(
    organizationId: string,
    planId: string,
    status: ContentPlanStatus,
  ): Promise<ContentPlanDocument> {
    const existing = (await this.delegate.findFirst({
      where: {
        id: planId,
        isDeleted: false,
        organizationId,
      },
    })) as PrismaContentPlan | null;

    if (!existing) {
      throw new NotFoundException('ContentPlan', planId);
    }

    const updated = (await this.delegate.update({
      data: {
        config: this.buildConfigPayload({ status }, existing.config) as never,
      },
      where: { id: planId },
    })) as PrismaContentPlan;

    return this.toDocument(updated);
  }

  async incrementExecutedCount(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    const existing = (await this.delegate.findFirst({
      where: {
        id: planId,
        isDeleted: false,
        organizationId,
      },
    })) as PrismaContentPlan | null;

    if (!existing) {
      return;
    }

    const currentConfig = this.asRecord(existing.config);
    const executedCount = this.asNumber(currentConfig.executedCount, 0) + 1;

    await this.delegate.update({
      data: {
        config: this.buildConfigPayload(
          { executedCount },
          currentConfig,
        ) as never,
      },
      where: { id: planId },
    });
  }

  async softDelete(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const existing = (await this.delegate.findFirst({
      where: {
        id: planId,
        isDeleted: false,
        organizationId,
      },
    })) as PrismaContentPlan | null;

    if (!existing) {
      throw new NotFoundException('ContentPlan', planId);
    }

    const updated = (await this.delegate.update({
      data: { isDeleted: true },
      where: { id: planId },
    })) as PrismaContentPlan;

    return this.toDocument(updated);
  }

  private toDocument(doc: PrismaContentPlan): ContentPlanDocument {
    const config = this.asRecord(doc.config);
    const name = this.asString(config.name) ?? doc.label ?? null;

    return this.normalizeDocument({
      ...doc,
      _id: doc.mongoId ?? doc.id,
      brand: doc.brandId,
      config,
      createdBy: doc.createdById,
      description: this.asString(config.description) ?? null,
      executedCount: this.asNumber(config.executedCount, 0),
      itemCount: this.asNumber(config.itemCount, 0),
      name,
      organization: doc.organizationId,
      periodEnd: this.asDate(config.periodEnd),
      periodStart: this.asDate(config.periodStart),
      status: this.asString(config.status) ?? ContentPlanStatus.DRAFT,
    });
  }

  private buildConfigPayload(
    data: ContentPlanConfigInput,
    existingConfig?: unknown,
  ): Record<string, unknown> {
    const payload = this.asRecord(existingConfig);

    if (data.name !== undefined) {
      payload.name = data.name;
    }

    if (data.description !== undefined) {
      payload.description = data.description;
    }

    if (data.status !== undefined) {
      payload.status = data.status;
    }

    if (data.periodStart !== undefined) {
      payload.periodStart = this.serializeDate(data.periodStart);
    }

    if (data.periodEnd !== undefined) {
      payload.periodEnd = this.serializeDate(data.periodEnd);
    }

    if (data.itemCount !== undefined) {
      payload.itemCount = data.itemCount;
    }

    if (data.executedCount !== undefined) {
      payload.executedCount = data.executedCount;
    }

    return payload;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private asDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  }

  private serializeDate(value: unknown): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return null;
  }
}
