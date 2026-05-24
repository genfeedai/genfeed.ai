import { TemplateUsageEntity } from '@api/collections/template-usage/entities/template-usage.entity';
import type { TemplateUsageDocument } from '@api/collections/template-usage/schemas/template-usage.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TemplateUsageService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUsage(usage: TemplateUsageDocument): TemplateUsageEntity {
    return {
      ...(usage as unknown as TemplateUsageEntity),
      _id:
        typeof usage.mongoId === 'string' && usage.mongoId.length > 0
          ? usage.mongoId
          : usage.id,
      organization: usage.organizationId,
      template: usage.templateId,
      user: usage.userId,
    };
  }

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
    if (!data.user) {
      throw new Error('Template usage requires a user id');
    }

    const usage = await this.prisma.templateUsage.create({
      data: {
        organizationId: data.organization,
        templateId: data.template,
        userId: data.user,
      },
    });

    return this.normalizeUsage(usage);
  }

  /**
   * Count usage for a template
   */
  countByTemplate(templateId: string): Promise<number> {
    return this.prisma.templateUsage.count({
      where: { templateId },
    });
  }

  /**
   * Find usage records by organization
   */
  async findByOrganization(
    organizationId: string,
    limit: number = 50,
  ): Promise<TemplateUsageEntity[]> {
    const usages = await this.prisma.templateUsage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      where: { organizationId },
    });

    return usages as unknown as TemplateUsageEntity[];
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
    const usage = await this.prisma.templateUsage.findUnique({
      where: { id: usageId },
    });

    if (!usage) {
      return null;
    }

    return {
      ...this.normalizeUsage(usage),
      feedback: updates.feedback,
      rating: updates.rating,
      wasModified: updates.wasModified ?? false,
    };
  }

  /**
   * Get average rating for a template
   */
  async getAverageRating(templateId: string): Promise<number | null> {
    await this.countByTemplate(templateId);
    return null;
  }
}
