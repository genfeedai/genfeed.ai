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
      autoRequeueWinners?: boolean;
    },
  ): Promise<TrendPreferencesDocument> {
    try {
      const brandId = preferences.brandId ?? null;
      const existing = await this.prisma.trendPreferences.findFirst({
        where: { brandId, isDeleted: false, organizationId },
      });
      const storedConfig = this.readObjectRecord(existing?.config);
      const normalizedPreferences: Record<string, unknown> = {
        ...(storedConfig ?? {}),
        categories:
          preferences.categories ??
          this.readStringArray(storedConfig?.categories),
        hashtags:
          preferences.hashtags ?? this.readStringArray(storedConfig?.hashtags),
        keywords:
          preferences.keywords ?? this.readStringArray(storedConfig?.keywords),
        platforms:
          preferences.platforms ??
          this.readStringArray(storedConfig?.platforms),
      };

      if (preferences.autoRequeueWinners !== undefined) {
        normalizedPreferences.autoRequeueWinners =
          preferences.autoRequeueWinners;
      } else if (storedConfig?.autoRequeueWinners !== undefined) {
        // `config` is a Json column and Prisma REPLACES Json values on update
        // (it does not merge), so preserve omitted fields from the stored
        // document. Leave the opt-in flag absent for a never-configured record
        // so the config shape stays clean (#1112).
        normalizedPreferences.autoRequeueWinners = this.readBoolean(
          storedConfig.autoRequeueWinners,
          false,
        );
      }

      const updateData = {
        config: normalizedPreferences,
        updatedAt: new Date(),
      };

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
      autoRequeueWinners: this.readBoolean(
        docRecord.autoRequeueWinners ?? config?.autoRequeueWinners,
        false,
      ),
      categories: this.readStringArray(
        docRecord.categories ?? config?.categories,
      ),
      hashtags: this.readStringArray(docRecord.hashtags ?? config?.hashtags),
      keywords: this.readStringArray(docRecord.keywords ?? config?.keywords),
      platforms: this.readStringArray(docRecord.platforms ?? config?.platforms),
    };
  }

  /**
   * Merge winning content-run signals into an org/brand's trend preferences so
   * future trend ingestion is biased toward what already performed (issue #166).
   * Signals are unioned into the existing arrays; the opt-in flag is preserved.
   */
  async mergeWinnerSignals(
    organizationId: string,
    brandId: string | undefined,
    signals: {
      categories?: string[];
      hashtags?: string[];
      keywords?: string[];
      platforms?: string[];
    },
  ): Promise<TrendPreferencesDocument> {
    const existing = await this.getPreferences(organizationId, brandId);

    return this.savePreferences(organizationId, {
      autoRequeueWinners: existing?.autoRequeueWinners,
      brandId,
      categories: this.unionSignals(existing?.categories, signals.categories),
      hashtags: this.unionSignals(existing?.hashtags, signals.hashtags),
      keywords: this.unionSignals(existing?.keywords, signals.keywords),
      platforms: this.unionSignals(existing?.platforms, signals.platforms),
    });
  }

  private unionSignals(
    existing: string[] | undefined,
    additions: string[] | undefined,
  ): string[] {
    return [
      ...new Set(
        [...(existing ?? []), ...(additions ?? [])].filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.length > 0,
        ),
      ),
    ];
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return fallback;
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
