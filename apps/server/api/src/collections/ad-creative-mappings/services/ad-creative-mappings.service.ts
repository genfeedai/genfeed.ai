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
      const doc = await this.prisma.adCreativeMapping.create({
        data: {
          adAccountId: input.adAccountId,
          brandId: input.brand,
          externalAdId: input.externalAdId,
          externalCreativeId: input.externalCreativeId,
          genfeedContentId: input.genfeedContentId,
          metadata: (input.metadata ?? {}) as never,
          organizationId: input.organization,
          platform: input.platform ?? 'meta',
          status: input.status ?? 'draft',
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
    return this.prisma.adCreativeMapping.findMany({
      where: {
        genfeedContentId,
        isDeleted: false,
        organizationId,
      },
    });
  }

  async findByExternalAdId(
    externalAdId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adCreativeMapping.findFirst({
      where: {
        externalAdId,
        isDeleted: false,
        organizationId,
      },
    });
  }

  async findByAdAccount(
    adAccountId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adCreativeMapping.findMany({
      where: {
        adAccountId,
        isDeleted: false,
        organizationId,
      },
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

      const doc = await this.prisma.adCreativeMapping.update({
        data: input as never,
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
