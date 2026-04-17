import { TemplateMetadataEntity } from '@api/collections/template-metadata/entities/template-metadata.entity';
import type { TemplateMetadataDocument } from '@api/collections/template-metadata/schemas/template-metadata.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class TemplateMetadataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create metadata record with defaults
   */
  async create(
    templateId: string,
    data?: Partial<TemplateMetadataEntity>,
  ): Promise<TemplateMetadataEntity> {
    const result = await this.prisma.templateMetadata.create({
      data: {
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
        templateId,
        usageCount: 0,
        version: data?.version ?? null,
      } as never,
    });

    return result as unknown as TemplateMetadataEntity;
  }

  /**
   * Update metadata
   */
  async update(
    templateId: string,
    updates: Partial<TemplateMetadataEntity>,
  ): Promise<TemplateMetadataEntity> {
    const existing = await this.prisma.templateMetadata.findFirst({
      where: { isDeleted: false, templateId },
    });

    if (!existing) {
      throw new NotFoundException('Template metadata not found');
    }

    const result = await this.prisma.templateMetadata.update({
      data: updates as never,
      where: { id: existing.id },
    });

    return result as unknown as TemplateMetadataEntity;
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
    // Find template by key first
    const template = await this.prisma.template.findFirst({
      where: { isDeleted: false, key, purpose: 'prompt' },
    });

    if (!template) {
      return; // Template not found, skip update
    }

    const templateId = template.id;

    const updateData: Record<string, unknown> = {};

    if (updates.incrementUsage) {
      updateData.usageCount = { increment: 1 };
      updateData.lastUsed = new Date();
    }

    if (updates.successRate !== undefined) {
      updateData.successRate = updates.successRate;
    }

    if (updates.averageQuality !== undefined) {
      updateData.averageQuality = updates.averageQuality;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.templateMetadata.updateMany({
        data: updateData as never,
        where: { templateId },
      });
    }
  }

  /**
   * Delete metadata (soft delete)
   */
  async delete(templateId: string): Promise<void> {
    await this.prisma.templateMetadata.updateMany({
      data: { isDeleted: true } as never,
      where: { templateId },
    });
  }
}
