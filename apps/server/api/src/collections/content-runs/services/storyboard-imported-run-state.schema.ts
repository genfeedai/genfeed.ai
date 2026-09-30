import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { brandRemixScenePipelineSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { storyboardRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { z } from 'zod';

export const storyboardLegacyConfigSchema = brandRemixRunConfigSchema.extend({
  scenePipeline: brandRemixScenePipelineSchema
    .extend({
      operation: brandRemixScenePipelineSchema.shape.operation
        .unwrap()
        .extend({ userId: z.string().min(1).optional() })
        .optional(),
    })
    .optional(),
});
export type StoryboardLegacyConfig = z.infer<
  typeof storyboardLegacyConfigSchema
>;

// Validate without normalizing defaults: the archived JSON is immutable evidence.
export const storyboardImportedRunStateSchema = z
  .object({
    version: z.literal(1),
    activeConfig: z
      .custom<StoryboardLegacyConfig>(
        (value) => storyboardLegacyConfigSchema.safeParse(value).success,
      )
      .optional(),
    originalConfig: z.custom<StoryboardLegacyConfig>(
      (value) => storyboardLegacyConfigSchema.safeParse(value).success,
    ),
  })
  .strict();
export const storyboardMigrationRecoverySchema = z
  .object({
    operationId: z.string().min(1),
    previousSequence: z.number().int().nonnegative(),
    nextSequence: z.number().int().positive(),
    jobId: z.string().min(1),
    state: z.enum(['pending', 'enqueued']),
  })
  .strict()
  .refine((value) => value.nextSequence === value.previousSequence + 1);

export const storyboardStoredRunConfigSchema = z
  .unknown()
  .transform((value, ctx) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid stored Storyboard config',
      });
      return z.NEVER;
    }
    const { importedState, migrationRecovery, ...publicValue } =
      value as Record<string, unknown>;
    const config = storyboardRunConfigSchema.safeParse(publicValue);
    if (!config.success) {
      for (const issue of config.error.issues)
        ctx.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        });
      return z.NEVER;
    }
    const archive =
      importedState === undefined
        ? undefined
        : storyboardImportedRunStateSchema.safeParse(importedState);
    const recovery =
      migrationRecovery === undefined
        ? undefined
        : storyboardMigrationRecoverySchema.safeParse(migrationRecovery);
    if (config.data.origin === 'migrated' && !archive?.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Migrated config requires validated original state',
      });
      return z.NEVER;
    }
    if ((archive && !archive.success) || (recovery && !recovery.success)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid imported state or recovery outbox',
      });
      return z.NEVER;
    }
    if (
      config.data.origin === 'migrated' &&
      archive?.success &&
      config.data.migration.sourceConfigHash !==
        storyboardConfigHash(archive.data.originalConfig)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Migration archive fingerprint mismatch',
      });
      return z.NEVER;
    }
    if (config.data.origin === 'native' && (archive || recovery)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Native config cannot contain migration evidence',
      });
      return z.NEVER;
    }
    return {
      ...config.data,
      ...(archive?.success ? { importedState: archive.data } : {}),
      ...(recovery?.success ? { migrationRecovery: recovery.data } : {}),
    };
  });
export type StoryboardStoredRunConfig = z.infer<
  typeof storyboardStoredRunConfigSchema
>;

export function storyboardPublicConfig(config: StoryboardStoredRunConfig) {
  const {
    importedState: _archive,
    migrationRecovery: _recovery,
    ...publicValue
  } = config;
  return storyboardRunConfigSchema.parse(publicValue);
}
export function storyboardLegacyState(
  config: Pick<StoryboardStoredRunConfig, 'importedState'>,
): StoryboardLegacyConfig | null {
  return config.importedState
    ? storyboardLegacyConfigSchema.parse(
        config.importedState.activeConfig ??
          config.importedState.originalConfig,
      )
    : null;
}
