import {
  AD_OPTIMIZATION_CONFIG_KEYS,
  type AdOptimizationConfigDocument,
  type AdOptimizationConfigKey,
  type AdOptimizationConfigValues,
  DEFAULT_AD_OPTIMIZATION_CONFIG,
} from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AdOptimizationConfig as PrismaAdOptimizationConfig } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdOptimizationConfigsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<AdOptimizationConfigDocument | null> {
    const doc = await this.prisma.adOptimizationConfig.findFirst({
      where: {
        isDeleted: false,
        organizationId,
      },
    });

    return doc ? this.toDocument(doc) : null;
  }

  async upsert(
    organizationId: string,
    data: Record<string, unknown>,
  ): Promise<AdOptimizationConfigDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adOptimizationConfig.findFirst({
        where: { isDeleted: false, organizationId },
      });

      const config = this.buildConfigPayload(data, existing?.config);
      let result: PrismaAdOptimizationConfig;
      if (existing) {
        result = await this.prisma.adOptimizationConfig.update({
          data: {
            config: config as never,
            organizationId,
          } as never,
          where: { id: existing.id },
        });
      } else {
        result = await this.prisma.adOptimizationConfig.create({
          data: {
            config: config as never,
            organizationId,
          } as never,
        });
      }

      this.logger.log(
        `${caller} upserted optimization config for org ${organizationId}`,
      );
      return this.toDocument(result);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findAllEnabled(): Promise<AdOptimizationConfigDocument[]> {
    const docs = await this.prisma.adOptimizationConfig.findMany({
      where: {
        isDeleted: false,
      },
    });

    return docs
      .map((doc) => this.toDocument(doc))
      .filter((doc) => doc.isEnabled);
  }

  private toDocument(
    doc: PrismaAdOptimizationConfig,
  ): AdOptimizationConfigDocument {
    const config = this.asRecord(doc.config);
    const values = this.normalizeConfigValues(config);

    return {
      ...doc,
      ...values,
      _id: doc.mongoId ?? doc.id,
      config,
      organization: doc.organizationId,
    };
  }

  private normalizeConfigValues(
    config: Record<string, unknown>,
  ): AdOptimizationConfigValues {
    return {
      analysisWindow: this.asNumber(
        config.analysisWindow,
        DEFAULT_AD_OPTIMIZATION_CONFIG.analysisWindow,
      ),
      isEnabled: this.asBoolean(
        config.isEnabled,
        DEFAULT_AD_OPTIMIZATION_CONFIG.isEnabled,
      ),
      maxBudgetIncreasePct: this.asNumber(
        config.maxBudgetIncreasePct,
        DEFAULT_AD_OPTIMIZATION_CONFIG.maxBudgetIncreasePct,
      ),
      maxCpm: this.asNumber(
        config.maxCpm,
        DEFAULT_AD_OPTIMIZATION_CONFIG.maxCpm,
      ),
      maxDailyBudgetPerCampaign: this.asNumber(
        config.maxDailyBudgetPerCampaign,
        DEFAULT_AD_OPTIMIZATION_CONFIG.maxDailyBudgetPerCampaign,
      ),
      maxTotalDailySpend: this.asNumber(
        config.maxTotalDailySpend,
        DEFAULT_AD_OPTIMIZATION_CONFIG.maxTotalDailySpend,
      ),
      minCtr: this.asNumber(
        config.minCtr,
        DEFAULT_AD_OPTIMIZATION_CONFIG.minCtr,
      ),
      minImpressions: this.asNumber(
        config.minImpressions,
        DEFAULT_AD_OPTIMIZATION_CONFIG.minImpressions,
      ),
      minRoas: this.asNumber(
        config.minRoas,
        DEFAULT_AD_OPTIMIZATION_CONFIG.minRoas,
      ),
      minSpend: this.asNumber(
        config.minSpend,
        DEFAULT_AD_OPTIMIZATION_CONFIG.minSpend,
      ),
    };
  }

  private buildConfigPayload(
    data: Record<string, unknown>,
    existingConfig?: unknown,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      ...this.asRecord(existingConfig),
      ...this.asRecord(data.config),
    };

    for (const key of AD_OPTIMIZATION_CONFIG_KEYS) {
      if (data[key] !== undefined) {
        payload[key] = this.normalizeConfigValue(key, data[key]);
      }
    }

    return payload;
  }

  private normalizeConfigValue(
    key: AdOptimizationConfigKey,
    value: unknown,
  ): boolean | number {
    if (key === 'isEnabled') {
      return this.asBoolean(value, DEFAULT_AD_OPTIMIZATION_CONFIG.isEnabled);
    }

    return this.asNumber(
      value,
      DEFAULT_AD_OPTIMIZATION_CONFIG[
        key as Exclude<AdOptimizationConfigKey, 'isEnabled'>
      ],
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }

    return fallback;
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }
}
