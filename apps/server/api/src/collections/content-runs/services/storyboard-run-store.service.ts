import type { BrandRemixRunRecord } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { RUN_SELECT } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  STORYBOARD_RUN_CONTRACT,
  type StoryboardRun,
  type StoryboardRunConfig,
  storyboardRunConfigSchema,
  storyboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

export function storyboardJson(
  config: StoryboardRunConfig,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue;
}

export function projectStoryboardRun(
  record: BrandRemixRunRecord,
): StoryboardRun {
  return storyboardRunSchema.parse({
    id: record.id,
    brandId: record.brandId,
    organizationId: record.organizationId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    config: record.config,
  });
}

@Injectable()
export class StoryboardRunStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    brandId: string,
    runId: string,
    expectedRevision?: number,
  ) {
    const record = await this.prisma.contentRun.findFirst({
      select: RUN_SELECT,
      where: scopedWhere(organizationId, {
        brandId,
        id: runId,
        config: { path: ['contract'], equals: STORYBOARD_RUN_CONTRACT },
      }),
    });
    if (!record) throw new NotFoundException('Storyboard run', runId);
    const parsed = storyboardRunConfigSchema.safeParse(record.config);
    if (!parsed.success)
      throw new ConflictException(
        'Stored storyboard configuration is invalid.',
      );
    if (
      expectedRevision !== undefined &&
      parsed.data.revision !== expectedRevision
    )
      throw new ConflictException(
        `Expected revision ${expectedRevision}; current revision is ${parsed.data.revision}. Reload before retrying.`,
      );
    return { record, config: parsed.data };
  }

  async save(
    organizationId: string,
    brandId: string,
    runId: string,
    previous: StoryboardRunConfig,
    next: StoryboardRunConfig,
  ): Promise<StoryboardRun> {
    const config = storyboardRunConfigSchema.parse(next);
    const result = await this.prisma.contentRun.updateMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: runId,
        config: { equals: storyboardJson(previous) },
      }),
      data: {
        config: storyboardJson(config),
        status: ContentRunStatus.PENDING,
      },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'The storyboard changed during this save. Reload before retrying.',
      );
    // Return the config accepted by this CAS, not a subsequent editor's revision.
    const { record } = await this.read(organizationId, brandId, runId);
    return projectStoryboardRun({
      ...record,
      config: storyboardJson(config) as Prisma.JsonValue,
    });
  }
}
