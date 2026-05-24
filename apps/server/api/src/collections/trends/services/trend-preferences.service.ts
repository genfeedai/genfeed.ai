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
          return this.normalizePreferences(brandPrefs);
        }
      }

      // Fall back to org-level preferences
      const orgPrefs = await this.prisma.trendPreferences.findFirst({
        where: { brandId: null, isDeleted: false, organizationId },
      });
      return this.normalizePreferences(orgPrefs);
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
      const normalizedPreferences = {
        categories: preferences.categories ?? [],
        hashtags: preferences.hashtags ?? [],
        keywords: preferences.keywords ?? [],
        platforms: preferences.platforms ?? [],
      };
      const updateData = {
        config: normalizedPreferences,
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
        return this.normalizePreferences(updated) as TrendPreferencesDocument;
      }

      const created = await this.prisma.trendPreferences.create({
        data: {
          ...updateData,
          brandId,
          isDeleted: false,
          organizationId,
        } as never,
      });
      return this.normalizePreferences(created) as TrendPreferencesDocument;
    } catch (error: unknown) {
      this.loggerService.error('Failed to save trend preferences', error);
      throw error;
    }
  }

  private normalizePreferences(
    doc: Awaited<
      ReturnType<PrismaService['trendPreferences']['findFirst']>
    > | null,
  ): TrendPreferencesDocument | null {
    if (!doc) {
      return null;
    }

    const docRecord = doc as Record<string, unknown>;
    const config = this.readObjectRecord(doc.config);

    return {
      ...(doc as TrendPreferencesDocument),
      categories: this.readStringArray(
        docRecord.categories ?? config?.categories,
      ),
      hashtags: this.readStringArray(docRecord.hashtags ?? config?.hashtags),
      keywords: this.readStringArray(docRecord.keywords ?? config?.keywords),
      platforms: this.readStringArray(docRecord.platforms ?? config?.platforms),
    };
  }

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
  }
}
