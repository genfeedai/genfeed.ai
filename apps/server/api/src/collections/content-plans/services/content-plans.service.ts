import { CreateContentPlanDto } from '@api/collections/content-plans/dto/create-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import type { ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import {
  asDate,
  asNumber,
  asRecord,
  asString,
  serializeDate,
} from '@api/collections/content-plans/utils/content-plan-data.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { ContentPlanStatus } from '@genfeedai/contracts';
import {
  Prisma,
  type ContentPlan as PrismaContentPlan,
  toPrismaJson,
} from '@genfeedai/prisma';
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
  UpdateContentPlanDto,
  Prisma.ContentPlanWhereInput
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
        executedCount: 0,
        config: toPrismaJson(
          this.buildConfigPayload(
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
          ),
        ),
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
      where: scopedWhere(organizationId, { brandId }),
    })) as PrismaContentPlan[];

    return docs.map((doc) => this.toDocument(doc));
  }

  async getByIdOrFail(
    organizationId: string,
    planId: string,
    brandId?: string,
  ): Promise<ContentPlanDocument> {
    const plan = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        id: planId,
        ...(brandId ? { brandId } : {}),
      }),
    })) as PrismaContentPlan | null;

    if (!plan) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return this.toDocument(plan);
  }

  async patch(
    id: string,
    updateDto: UpdateContentPlanDto & {
      organizationId?: string;
      brandId?: string;
    },
  ): Promise<ContentPlanDocument> {
    const organizationId = requireRelationId(
      updateDto.organizationId,
      'organizationId',
      `ContentPlan ${id}`,
    );
    const existing = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        id,
        ...(updateDto.brandId ? { brandId: updateDto.brandId } : {}),
      }),
    })) as PrismaContentPlan | null;

    if (!existing) {
      throw new NotFoundException('ContentPlan', id);
    }

    const updated = (await this.delegate.update({
      data: {
        ...(updateDto.name !== undefined ? { label: updateDto.name } : {}),
        config: toPrismaJson(
          this.buildConfigPayload(updateDto, existing.config),
        ),
      },
      where: { id },
    })) as PrismaContentPlan;

    return this.toDocument(updated);
  }

  async updateStatus(
    organizationId: string,
    planId: string,
    status: ContentPlanStatus,
    brandId?: string,
  ): Promise<ContentPlanDocument> {
    const existing = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        id: planId,
        ...(brandId ? { brandId } : {}),
      }),
    })) as PrismaContentPlan | null;

    if (!existing) {
      throw new NotFoundException('ContentPlan', planId);
    }

    const updated = (await this.delegate.update({
      data: {
        config: toPrismaJson(
          this.buildConfigPayload({ status }, existing.config),
        ),
      },
      where: { id: planId },
    })) as PrismaContentPlan;

    return this.toDocument(updated);
  }

  async incrementExecutedCount(
    organizationId: string,
    planId: string,
    brandId?: string,
  ): Promise<void> {
    await this.delegate.updateMany({
      data: {
        executedCount: { increment: 1 },
      },
      where: scopedWhere(organizationId, {
        id: planId,
        ...(brandId ? { brandId } : {}),
      }),
    });
  }

  async softDelete(
    organizationId: string,
    planId: string,
    brandId?: string,
  ): Promise<ContentPlanDocument> {
    const existing = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        id: planId,
        ...(brandId ? { brandId } : {}),
      }),
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
    const config = asRecord(doc.config);
    const name = asString(config.name) ?? doc.label ?? null;

    return this.normalizeDocument({
      ...doc,
      brand: doc.brandId,
      config,
      createdBy: doc.createdById,
      description: asString(config.description) ?? null,
      executedCount: doc.executedCount ?? asNumber(config.executedCount, 0),
      itemCount: asNumber(config.itemCount, 0),
      name,
      organization: doc.organizationId,
      periodEnd: asDate(config.periodEnd),
      periodStart: asDate(config.periodStart),
      status: asString(config.status) ?? ContentPlanStatus.DRAFT,
    });
  }

  private buildConfigPayload(
    data: ContentPlanConfigInput,
    existingConfig?: unknown,
  ): Record<string, unknown> {
    const payload = asRecord(existingConfig);

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
      payload.periodStart = serializeDate(data.periodStart);
    }

    if (data.periodEnd !== undefined) {
      payload.periodEnd = serializeDate(data.periodEnd);
    }

    if (data.itemCount !== undefined) {
      payload.itemCount = data.itemCount;
    }

    if (data.executedCount !== undefined) {
      payload.executedCount = data.executedCount;
    }

    return payload;
  }
}
