import type { TrendPreferencesDocument } from '@api/collections/trends/schemas/trend-preferences.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async getPreferences(
    organizationId: string,
    brandId?: string,
  ): Promise<TrendPreferencesDocument | null> {
    try {
      // Try brand-specific preferences first
      if (brandId) {
        const brandPrefs = await this.prisma.trendPreferences.findFirst({
          where: { brandId, isDeleted: false, organizationId },
        });
        if (brandPrefs) {
          return brandPrefs as unknown as TrendPreferencesDocument;
        }
      }

      // Fall back to org-level preferences
      const orgPrefs = await this.prisma.trendPreferences.findFirst({
        where: { brandId: null, isDeleted: false, organizationId },
      });
      return orgPrefs as unknown as TrendPreferencesDocument | null;
    } catch (error: unknown) {
      this.loggerService.error('Failed to get trend preferences', error);
      return null;
    }
  }

  async savePreferences(
    organizationId: string,
    preferences: {
      brandId?: string;
      categories?: string[];
      keywords?: string[];
      platforms?: string[];
      hashtags?: string[];
    },
  ): Promise<TrendPreferencesDocument> {
    try {
      const brandId = preferences.brandId ?? null;
      const updateData = {
        categories: preferences.categories ?? [],
        hashtags: preferences.hashtags ?? [],
        keywords: preferences.keywords ?? [],
        platforms: preferences.platforms ?? [],
        updatedAt: new Date(),
      };

      const existing = await this.prisma.trendPreferences.findFirst({
        where: { brandId, isDeleted: false, organizationId },
      });

      if (existing) {
        const updated = await this.prisma.trendPreferences.update({
          data: updateData as never,
          where: { id: existing.id },
        });
        return updated as unknown as TrendPreferencesDocument;
      }

      const created = await this.prisma.trendPreferences.create({
        data: {
          ...updateData,
          brandId,
          isDeleted: false,
          organizationId,
        } as never,
      });
      return created as unknown as TrendPreferencesDocument;
    } catch (error: unknown) {
      this.loggerService.error('Failed to save trend preferences', error);
      throw error;
    }
  }
}
