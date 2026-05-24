import type { AdCreativeMappingStatus } from '@api/collections/ad-creative-mappings/schemas/ad-creative-mapping.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface CreateAdCreativeMappingInput {
  organization: string;
  brand?: string;
  genfeedContentId: string;
  externalAdId?: string;
  externalCreativeId?: string;
  adAccountId: string;
  platform?: string;
  status?: AdCreativeMappingStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateAdCreativeMappingInput {
  externalAdId?: string;
  externalCreativeId?: string;
  status?: AdCreativeMappingStatus;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdCreativeMappingsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    input: CreateAdCreativeMappingInput,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // The Prisma model only has: id, mongoId, organizationId, brandId, data, isDeleted, timestamps.
      // All domain-specific fields live in the `data` JSON column.
      const doc = await this.prisma.adCreativeMapping.create({
        data: {
          brandId: input.brand ?? null,
          data: {
            adAccountId: input.adAccountId,
            externalAdId: input.externalAdId,
            externalCreativeId: input.externalCreativeId,
            genfeedContentId: input.genfeedContentId,
            metadata: input.metadata ?? {},
            platform: input.platform ?? 'meta',
            status: input.status ?? 'draft',
          } as never,
          isDeleted: false,
          organizationId: input.organization,
        },
      });

      this.logger.log(`${caller} created mapping ${doc.id}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adCreativeMapping.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });
  }

  async findByContentId(
    genfeedContentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    // genfeedContentId lives in data JSON — fetch by org then filter in memory
    const rows = await this.prisma.adCreativeMapping.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
    });
    return rows.filter((row) => {
      const d = row.data as Record<string, unknown> | null;
      return d?.genfeedContentId === genfeedContentId;
    });
  }

  async findByExternalAdId(
    externalAdId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    // externalAdId lives in data JSON — fetch by org then filter in memory
    const rows = await this.prisma.adCreativeMapping.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
    });
    return (
      rows.find((row) => {
        const d = row.data as Record<string, unknown> | null;
        return d?.externalAdId === externalAdId;
      }) ?? null
    );
  }

  async findByAdAccount(
    adAccountId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    // adAccountId lives in data JSON — fetch by org then filter in memory
    const rows = await this.prisma.adCreativeMapping.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
    });
    return rows.filter((row) => {
      const d = row.data as Record<string, unknown> | null;
      return d?.adAccountId === adAccountId;
    });
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateAdCreativeMappingInput,
  ): Promise<Record<string, unknown> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adCreativeMapping.findFirst({
        where: { id, isDeleted: false, organizationId },
      });

      if (!existing) {
        return null;
      }

      const existingData = (existing.data as Record<string, unknown>) ?? {};

      // Build updated data — only include keys that are explicitly provided
      const patchData: Record<string, unknown> = {};
      if (input.externalAdId !== undefined) {
        patchData.externalAdId = input.externalAdId;
      }
      if (input.externalCreativeId !== undefined) {
        patchData.externalCreativeId = input.externalCreativeId;
      }
      if (input.status !== undefined) {
        patchData.status = input.status;
      }
      if (input.metadata !== undefined) {
        patchData.metadata = input.metadata;
      }

      const doc = await this.prisma.adCreativeMapping.update({
        data: { data: { ...existingData, ...patchData } as never },
        where: { id },
      });

      this.logger.log(`${caller} updated mapping ${id}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async softDelete(id: string, organizationId: string): Promise<boolean> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adCreativeMapping.findFirst({
        where: { id, isDeleted: false, organizationId },
      });

      if (!existing) {
        return false;
      }

      await this.prisma.adCreativeMapping.update({
        data: { isDeleted: true },
        where: { id },
      });

      this.logger.log(`${caller} soft-deleted mapping ${id}`);
      return true;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
