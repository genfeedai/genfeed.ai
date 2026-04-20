import { CreateContentPlanDto } from '@api/collections/content-plans/dto/create-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import type { ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ContentPlanStatus } from '@genfeedai/enums';
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

  /**
   * Internal creation method bypassing DTO validation.
   */
  async createInternal(
    input: CreateContentPlanInternal,
  ): Promise<ContentPlanDocument> {
    return this.delegate.create({
      data: input as Record<string, unknown>,
    }) as Promise<ContentPlanDocument>;
  }

  listByBrand(
    organizationId: string,
    brandId: string,
  ): Promise<ContentPlanDocument[]> {
    return this.delegate.findMany({
      where: { brandId, isDeleted: false, organizationId },
    }) as Promise<ContentPlanDocument[]>;
  }

  async getByIdOrFail(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const plan = await this.findOne({
      id: planId,
      isDeleted: false,
      organizationId,
    });

    if (!plan) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return plan;
  }

  async updateStatus(
    organizationId: string,
    planId: string,
    status: ContentPlanStatus,
  ): Promise<ContentPlanDocument> {
    const existing = await this.delegate.findFirst({
      where: { id: planId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return this.delegate.update({
      where: { id: planId },
      data: { status },
    }) as Promise<ContentPlanDocument>;
  }

  async incrementExecutedCount(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    const existing = await this.delegate.findFirst({
      where: { id: planId, isDeleted: false, organizationId },
    });

    if (!existing) return;

    await this.delegate.update({
      where: { id: planId },
      data: { executedCount: { increment: 1 } },
    });
  }

  async softDelete(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const existing = await this.delegate.findFirst({
      where: { id: planId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return this.delegate.update({
      where: { id: planId },
      data: { isDeleted: true },
    }) as Promise<ContentPlanDocument>;
  }
}
