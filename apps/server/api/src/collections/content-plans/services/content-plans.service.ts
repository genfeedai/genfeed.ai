import { CreateContentPlanDto } from '@api/collections/content-plans/dto/create-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import {
  ContentPlan,
  type ContentPlanDocument,
} from '@api/collections/content-plans/schemas/content-plan.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ContentPlanStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export interface CreateContentPlanInternal {
  organization: Types.ObjectId;
  brand: Types.ObjectId;
  createdBy: Types.ObjectId;
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
    @InjectModel(ContentPlan.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ContentPlanDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Internal creation method bypassing DTO validation.
   * Used by ContentPlannerService for programmatic plan creation.
   */
  async createInternal(
    input: CreateContentPlanInternal,
  ): Promise<ContentPlanDocument> {
    const doc = await this.model.create(input);
    return doc;
  }

  listByBrand(
    organizationId: string,
    brandId: string,
  ): Promise<ContentPlanDocument[]> {
    return this.find({
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async getByIdOrFail(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const plan = await this.findOne({
      _id: new Types.ObjectId(planId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(planId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: { status } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return updated;
  }

  async incrementExecutedCount(
    organizationId: string,
    planId: string,
  ): Promise<void> {
    await this.model.updateOne(
      {
        _id: new Types.ObjectId(planId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $inc: { executedCount: 1 } },
    );
  }

  async softDelete(
    organizationId: string,
    planId: string,
  ): Promise<ContentPlanDocument> {
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(planId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: { isDeleted: true } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ContentPlan', planId);
    }

    return updated;
  }
}
