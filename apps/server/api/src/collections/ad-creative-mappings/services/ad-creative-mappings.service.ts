import type { AdCreativeMappingStatus } from '@api/collections/ad-creative-mappings/schemas/ad-creative-mapping.schema';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { toPrismaJson } from '@genfeedai/prisma';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';

export interface CreateAdCreativeMappingInput {
  organizationId: string;
  brandId?: string;
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
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'adCreativeMapping'>,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async create(
    input: CreateAdCreativeMappingInput,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Domain-specific mapping fields are persisted in the JSON data column.
      // All domain-specific fields live in the `data` JSON column.
      const doc = await this.prisma.adCreativeMapping.create({
        data: {
          brandId: input.brandId ?? null,
          data: toPrismaJson({
            adAccountId: input.adAccountId,
            externalAdId: input.externalAdId,
            externalCreativeId: input.externalCreativeId,
            genfeedContentId: input.genfeedContentId,
            metadata: input.metadata ?? {},
            platform: input.platform ?? 'meta',
            status: input.status ?? 'draft',
          }),
          isDeleted: false,
          organizationId: input.organizationId,
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
      where: scopedWhere(organizationId, { id }),
    });
  }

  async findByContentId(
    genfeedContentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adCreativeMapping.findMany({
      where: scopedWhere(organizationId, {
        data: { equals: genfeedContentId, path: ['genfeedContentId'] },
      }),
    });
  }

  async findByExternalAdId(
    externalAdId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adCreativeMapping.findFirst({
      where: scopedWhere(organizationId, {
        data: { equals: externalAdId, path: ['externalAdId'] },
      }),
    });
  }

  async findByAdAccount(
    adAccountId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adCreativeMapping.findMany({
      where: scopedWhere(organizationId, {
        data: { equals: adAccountId, path: ['adAccountId'] },
      }),
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
        where: scopedWhere(organizationId, { id }),
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
        data: { data: toPrismaJson({ ...existingData, ...patchData }) },
        where: scopedWhere(organizationId, { id }),
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
        where: scopedWhere(organizationId, { id }),
      });

      if (!existing) {
        return false;
      }

      await this.prisma.adCreativeMapping.update({
        data: { isDeleted: true },
        where: scopedWhere(organizationId, { id }),
      });

      this.logger.log(`${caller} soft-deleted mapping ${id}`);
      return true;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
