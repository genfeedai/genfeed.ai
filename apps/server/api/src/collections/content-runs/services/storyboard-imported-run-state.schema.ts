import {
  assetJournalSchema,
  projectAssetGenerations,
} from '@api/collections/content-runs/services/storyboard-asset-bible-state';
import {
  characterJournalSchema,
  characterStructuralAssociation,
} from '@api/collections/content-runs/services/storyboard-character-replace-state';
import {
  projectShotRenders,
  shotRenderJournalSchema,
} from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { stillJournalSchema } from '@api/collections/content-runs/services/storyboard-still-state';
import { storyboardRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { z } from 'zod';

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
    // `shotRenders` and `assetGenerations` are projected from their
    // journals, never stored.
    const {
      characterReplacementOperations,
      stillOperations,
      shotRenderOperations,
      assetOperations,
      shotRenders: _projected,
      assetGenerations: _projectedAssets,
      ...publicValue
    } = value as Record<string, unknown>;
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
    const journal =
      characterReplacementOperations === undefined
        ? undefined
        : characterJournalSchema.safeParse(characterReplacementOperations);
    if (journal && !journal.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid character recovery journal',
      });
      return z.NEVER;
    }
    const stills =
      stillOperations === undefined
        ? undefined
        : stillJournalSchema.safeParse(stillOperations);
    if (stills && !stills.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid still generation journal',
      });
      return z.NEVER;
    }
    const renders =
      shotRenderOperations === undefined
        ? undefined
        : shotRenderJournalSchema.safeParse(shotRenderOperations);
    if (renders && !renders.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid shot render journal',
      });
      return z.NEVER;
    }
    const assets =
      assetOperations === undefined
        ? undefined
        : assetJournalSchema.safeParse(assetOperations);
    if (assets && !assets.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid asset bible journal',
      });
      return z.NEVER;
    }
    return {
      ...config.data,
      ...(journal?.success
        ? { characterReplacementOperations: journal.data }
        : {}),
      ...(stills?.success ? { stillOperations: stills.data } : {}),
      ...(renders?.success ? { shotRenderOperations: renders.data } : {}),
      ...(assets?.success ? { assetOperations: assets.data } : {}),
    };
  });
export type StoryboardStoredRunConfig = z.infer<
  typeof storyboardStoredRunConfigSchema
>;

export function storyboardPublicConfig(config: StoryboardStoredRunConfig) {
  const {
    characterReplacementOperations: journal,
    stillOperations: _stills,
    shotRenderOperations,
    assetOperations,
    ...publicValue
  } = config;
  return storyboardRunConfigSchema.parse({
    ...publicValue,
    shotRenders: projectShotRenders(publicValue.plan, shotRenderOperations),
    assetGenerations: projectAssetGenerations(assetOperations),
    characterReplacements: publicValue.characterReplacements?.filter((item) => {
      const op = journal?.find((op) =>
        op.receipts.some((r) => r.requestId === item.requestId),
      );
      return !op || characterStructuralAssociation(config, op);
    }),
  });
}
