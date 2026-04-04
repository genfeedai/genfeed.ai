import { TemplateUsageEntity } from '@api/collections/template-usage/entities/template-usage.entity';
import {
  TemplateUsage,
  type TemplateUsageDocument,
} from '@api/collections/template-usage/schemas/template-usage.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class TemplateUsageService {
  constructor(
    @InjectModel(TemplateUsage.name, DB_CONNECTIONS.CLOUD)
    private templateUsageModel: Model<TemplateUsageDocument>,
  ) {}

  /**
   * Create a usage record
   */
  async create(data: {
    organization: string;
    user?: string;
    template: string;
    generatedContent: string;
    variables?: Record<string, string>;
  }): Promise<TemplateUsageEntity> {
    const usage = new this.templateUsageModel({
      generatedContent: data.generatedContent,
      organization: new Types.ObjectId(data.organization),
      template: new Types.ObjectId(data.template),
      user: data.user ? new Types.ObjectId(data.user) : undefined,
      variables: data.variables,
      wasModified: false,
    });

    await usage.save();
    const usageObj = usage.toObject();
    return {
      ...usageObj,
      _id: usageObj._id.toString(),
      organization: usageObj.organization?.toString(),
      template: usageObj.template?.toString(),
      user: usageObj.user?.toString(),
    } as unknown as TemplateUsageEntity;
  }

  /**
   * Count usage for a template
   */
  countByTemplate(templateId: string): Promise<number> {
    return this.templateUsageModel.countDocuments({
      template: new Types.ObjectId(templateId),
    });
  }

  /**
   * Find usage records by organization
   */
  async findByOrganization(
    organizationId: string,
    limit: number = 50,
  ): Promise<TemplateUsageEntity[]> {
    const usages = await this.templateUsageModel
      .find({ organization: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return usages.map((usage) => ({
      ...usage,
      _id: usage._id.toString(),
      organization: usage.organization?.toString(),
      template: usage.template?.toString(),
      user: usage.user?.toString(),
    })) as unknown as TemplateUsageEntity[];
  }

  /**
   * Update usage record (e.g., add rating or feedback)
   */
  async update(
    usageId: string,
    updates: {
      rating?: number;
      feedback?: string;
      wasModified?: boolean;
    },
  ): Promise<TemplateUsageEntity | null> {
    const usage = await this.templateUsageModel
      .findByIdAndUpdate(
        usageId,
        { $set: updates },
        { returnDocument: 'after' },
      )
      .lean();

    if (!usage) {
      return null;
    }

    return {
      ...usage,
      _id: usage._id.toString(),
      organization: usage.organization?.toString(),
      template: usage.template?.toString(),
      user: usage.user?.toString(),
    } as unknown as TemplateUsageEntity;
  }

  /**
   * Get average rating for a template
   */
  async getAverageRating(templateId: string): Promise<number | null> {
    const result = await this.templateUsageModel.aggregate([
      {
        $match: {
          rating: { $exists: true, $ne: null },
          template: new Types.ObjectId(templateId),
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
        },
      },
    ]);

    return result.length > 0 ? result[0].averageRating : null;
  }
}
