import type { BrandRemixRunRecord } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { RUN_SELECT } from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  type StoryboardStoredRunConfig,
  storyboardPublicConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  STORYBOARD_RUN_CONTRACT,
  type StoryboardRun,
  storyboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

export function storyboardJson(
  config: StoryboardStoredRunConfig,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue;
}

export function projectStoryboardRun(
  record: BrandRemixRunRecord,
): StoryboardRun {
  const config = storyboardPublicConfig(
    storyboardStoredRunConfigSchema.parse(record.config),
  );
  return storyboardRunSchema.parse({
    id: record.id,
    brandId: record.brandId,
    organizationId: record.organizationId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    config,
    migrationReview: config.migrationReview ?? null,
    importedPresentation: config.importedPresentation ?? null,
  });
}

@Injectable()
export class StoryboardRunStoreService {
  private readonly snapshots = new WeakMap<
    StoryboardStoredRunConfig,
    {
      organizationId: string;
      brandId: string;
      runId: string;
      raw: Prisma.InputJsonValue;
    }
  >();

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
    const parsed = storyboardStoredRunConfigSchema.safeParse(record.config);
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
    this.snapshots.set(parsed.data, {
      organizationId,
      brandId,
      runId,
      raw: JSON.parse(JSON.stringify(record.config)) as Prisma.InputJsonValue,
    });
    return { record, config: parsed.data };
  }

  async save(
    organizationId: string,
    brandId: string,
    runId: string,
    previous: StoryboardStoredRunConfig,
    next: StoryboardStoredRunConfig,
  ): Promise<StoryboardRun> {
    const config = storyboardStoredRunConfigSchema.parse(next);
    const snapshot = this.snapshots.get(previous);
    if (
      snapshot &&
      (snapshot.organizationId !== organizationId ||
        snapshot.brandId !== brandId ||
        snapshot.runId !== runId)
    )
      throw new ConflictException(
        'The storyboard snapshot belongs to another run.',
      );
    const result = await this.prisma.contentRun.updateMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: runId,
        config: { equals: snapshot?.raw ?? storyboardJson(previous) },
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
