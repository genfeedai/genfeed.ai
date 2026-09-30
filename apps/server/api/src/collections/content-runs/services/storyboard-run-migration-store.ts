import type { ContentRunPersistenceClient } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  convertStoryboardRun,
  type StoryboardMigrationContext,
  type StoryboardMigrationRecord,
  storyboardConfigHash,
} from '@api/collections/content-runs/services/storyboard-run-migration';
import { storyboardJson } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { Prisma } from '@genfeedai/prisma';

export interface StoryboardMigrationApplyOptions {
  dryRun: boolean;
  cutover?: {
    legacyProducersStopped: true;
    workerAdmissionDrained: true;
    runId: string;
    originalConfigHash: string;
  };
}
/** Called only by the coordinated release runner, never implicitly by a read. */
export async function applyStoryboardRunMigration(
  client: ContentRunPersistenceClient,
  record: StoryboardMigrationRecord,
  context: StoryboardMigrationContext,
  options: StoryboardMigrationApplyOptions,
) {
  const conversion = convertStoryboardRun(record, context);
  if (options.dryRun) return { status: 'dry_run' as const, conversion };
  if (conversion.status === 'unsupported' || conversion.status === 'unchanged')
    return { status: conversion.status, conversion };
  if (
    !options.cutover?.legacyProducersStopped ||
    !options.cutover.workerAdmissionDrained ||
    options.cutover.runId !== record.id ||
    options.cutover.originalConfigHash !== storyboardConfigHash(record.config)
  )
    throw new Error('STORYBOARD_MIGRATION_CUTOVER_REQUIRED');
  const config = storyboardStoredRunConfigSchema.parse(conversion.config);
  const applied = await client.contentRun.updateMany({
    where: {
      organizationId: context.organizationId,
      brandId: context.brandId,
      id: record.id,
      isDeleted: false,
      updatedAt: record.updatedAt,
      AND: [
        { config: { equals: record.config as Prisma.InputJsonValue } },
        { config: { path: ['revision'], equals: config.revision } },
      ],
    },
    data: { config: storyboardJson(config) },
  });
  return {
    status: applied.count === 1 ? ('applied' as const) : ('conflict' as const),
    conversion,
  };
}
