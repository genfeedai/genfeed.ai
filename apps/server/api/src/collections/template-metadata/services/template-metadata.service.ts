import { TemplateMetadataEntity } from '@api/collections/template-metadata/entities/template-metadata.entity';
import {
  TemplateMetadata,
  type TemplateMetadataDocument,
} from '@api/collections/template-metadata/schemas/template-metadata.schema';
import {
  Template,
  type TemplateDocument,
} from '@api/collections/templates/schemas/template.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class TemplateMetadataService {
  constructor(
    @InjectModel(TemplateMetadata.name, DB_CONNECTIONS.CLOUD)
    private templateMetadataModel: Model<TemplateMetadataDocument>,
    @InjectModel(Template.name, DB_CONNECTIONS.CLOUD)
    private readonly templateModel: Model<TemplateDocument>,
  ) {}

  /**
   * Create metadata record with defaults
   */
  async create(
    templateId: string,
    data?: Partial<TemplateMetadataEntity>,
  ): Promise<TemplateMetadataEntity> {
    const metadata = new this.templateMetadataModel({
      author: data?.author ?? null,
      averageQuality: null,
      compatiblePlatforms: data?.compatiblePlatforms ?? [],
      difficulty: data?.difficulty ?? null,
      estimatedTime: data?.estimatedTime ?? null,
      goals: data?.goals ?? [],
      isDeleted: false,
      lastUsed: null,
      license: data?.license ?? null,
      requiredFeatures: data?.requiredFeatures ?? [],
      successRate: null,
      template: templateId,
      usageCount: 0,
      version: data?.version ?? null,
    });

    await metadata.save();
    const metadataObj = metadata.toObject();
    return {
      ...metadataObj,
      _id: metadataObj._id.toString(),
    } as unknown as TemplateMetadataEntity;
  }

  /**
   * Update metadata
   */
  async update(
    templateId: string,
    updates: Partial<TemplateMetadataEntity>,
  ): Promise<TemplateMetadataEntity> {
    const metadata = await this.templateMetadataModel.findOneAndUpdate(
      { isDeleted: false, template: templateId },
      { $set: updates },
      { returnDocument: 'after' },
    );

    if (!metadata) {
      throw new NotFoundException('Template metadata not found');
    }

    const metadataObj = metadata.toObject();
    return {
      ...metadataObj,
      _id: metadataObj._id.toString(),
    } as unknown as TemplateMetadataEntity;
  }

  /**
   * Update metadata by template key (for prompt templates)
   */
  async updateByTemplateKey(
    key: string,
    updates: {
      incrementUsage?: boolean;
      successRate?: number;
      averageQuality?: number;
    },
  ): Promise<void> {
    // Find template by key first using the model directly (avoids circular dep)
    const template = await this.templateModel.findOne({
      isDeleted: false,
      key,
      purpose: 'prompt',
    });

    if (!template) {
      return; // Template not found, skip update
    }

    const templateId = template._id.toString();

    const updateData: Record<string, unknown> = {};
    let setData: Record<string, unknown> = {};

    if (updates.incrementUsage) {
      updateData.$inc = { usageCount: 1 };
      setData = { lastUsed: new Date() };
    }

    if (updates.successRate !== undefined) {
      setData.successRate = updates.successRate;
    }

    if (updates.averageQuality !== undefined) {
      setData.averageQuality = updates.averageQuality;
    }

    if (Object.keys(setData).length > 0) {
      updateData.$set = setData;
    }

    if (Object.keys(updateData).length > 0) {
      await this.templateMetadataModel.updateOne(
        { template: templateId },
        updateData,
      );
    }
  }

  /**
   * Delete metadata (soft delete)
   */
  async delete(templateId: string): Promise<void> {
    await this.templateMetadataModel.updateOne(
      { template: templateId },
      { $set: { isDeleted: true } },
    );
  }
}
