import {
  remixToJson,
  requireBrandRemixBrandId,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import {
  type BrandRemixRunRecord,
  type ContentRunPersistenceClient,
  MAX_SERIALIZATION_RETRIES,
  PRISMA_SERIALIZATION_FAILURE,
  RUN_SELECT,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BrandRemixRunConfig,
  type BrandRemixSourceSelector,
  brandRemixRunConfigSchema,
} from '@api-types/contracts/brand-remix-run.contract';
import { ContentRunStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixRunPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  requireBrandId(run: BrandRemixRunRecord): string {
    return requireBrandRemixBrandId(run);
  }

  parseConfig(value: Prisma.JsonValue, runId: string): BrandRemixRunConfig {
    const parsed = brandRemixRunConfigSchema.safeParse(value);
    if (!parsed.success) {
      throw new NotFoundException('Brand remix run', runId);
    }
    return parsed.data;
  }

  async requireRun(
    organizationId: string,
    runId: string,
  ): Promise<BrandRemixRunRecord> {
    const run = await this.prisma.contentRun.findFirst({
      select: RUN_SELECT,
      where: scopedWhere(organizationId, { id: runId }),
    });
    if (!run) throw new NotFoundException('Brand remix run', runId);
    this.parseConfig(run.config, runId);
    return run;
  }

  async compareAndSwapExactConfig(params: {
    expectedConfig: BrandRemixRunConfig;
    nextConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    status: ContentRunStatus;
  }): Promise<BrandRemixRunRecord | null> {
    const result = await this.prisma.contentRun.updateMany({
      data: {
        config: remixToJson(params.nextConfig),
        status: params.status,
      },
      where: scopedWhere(params.organizationId, {
        config: { equals: remixToJson(params.expectedConfig) },
        id: params.runId,
      }),
    });
    return result.count === 1
      ? this.requireRun(params.organizationId, params.runId)
      : null;
  }

  async compareAndSwapConfig(params: {
    expectedPhase: BrandRemixRunConfig['phase'];
    expectedRevision: number;
    nextConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    status: ContentRunStatus;
  }): Promise<BrandRemixRunRecord> {
    const result = await this.prisma.contentRun.updateMany({
      data: {
        config: remixToJson(params.nextConfig),
        status: params.status,
      },
      where: scopedWhere(params.organizationId, {
        AND: [
          {
            config: {
              equals: params.expectedRevision,
              path: ['revision'],
            },
          },
          {
            config: {
              equals: params.expectedPhase,
              path: ['phase'],
            },
          },
        ],
        id: params.runId,
      }),
    });
    if (result.count !== 1) {
      throw new ConflictException({
        detail:
          'The remix changed while this request was in progress. Reload it and retry.',
        title: 'Stale remix revision',
      });
    }
    return this.requireRun(params.organizationId, params.runId);
  }

  findReusablePrefilledRun(
    organizationId: string,
    brandId: string,
    selector: BrandRemixSourceSelector,
    client: ContentRunPersistenceClient = this.prisma,
  ): Promise<BrandRemixRunRecord | null> {
    return client.contentRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: RUN_SELECT,
      where: scopedWhere(organizationId, {
        AND: [
          {
            config: {
              equals: remixToJson(selector),
              path: ['sourceSnapshot', 'selector'],
            },
          },
          { config: { equals: 'prefilled', path: ['phase'] } },
        ],
        brandId,
        status: ContentRunStatus.PENDING,
      }),
    });
  }

  async createOrReusePrefilledRun(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    selector: BrandRemixSourceSelector;
  }): Promise<BrandRemixRunRecord> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const client =
              transaction as unknown as ContentRunPersistenceClient;
            const reusable = await this.findReusablePrefilledRun(
              params.organizationId,
              params.brandId,
              params.selector,
              client,
            );
            if (reusable) return reusable;

            return client.contentRun.create({
              data: {
                brandId: params.brandId,
                config: remixToJson(params.config),
                isDeleted: false,
                organizationId: params.organizationId,
                status: ContentRunStatus.PENDING,
              },
              select: RUN_SELECT,
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (
          (error as { code?: string }).code === PRISMA_SERIALIZATION_FAILURE &&
          attempt < MAX_SERIALIZATION_RETRIES - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      detail: 'Concurrent remix preparation did not settle. Retry the request.',
      title: 'Remix preparation conflict',
    });
  }
}
