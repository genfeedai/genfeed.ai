import { composeCharacterSheetPrompt } from '@api/endpoints/ai-actions/prompts/character-sheet-preset';
import {
  type QuoteStoryboardAssets,
  STORYBOARD_ASSET_BIBLE_LIMITS,
  type StoryboardAssetEntry,
  type StoryboardAssetGeneration,
  storyboardAssetActionSchema,
  storyboardAssetGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-asset-bible.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Terminal operations beyond this are pruned oldest first. Live operations
 * are never pruned.
 */
export const ASSET_JOURNAL_CAPACITY = 64;
/** A dispatch that left no placeholder for this long never reached a provider. */
export const ASSET_ABANDONED_MS = 10 * 60_000;

export const assetOperationSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    entryId: z.string().min(1),
    action: storyboardAssetActionSchema,
    actorUserId: z.string().min(1),
    modelKey: z.string().min(1),
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    prompt: z.string().min(1).max(8_000),
    referenceAssetIds: z.array(z.string().min(1)).max(20),
    aspectRatio: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    state: z.enum(['pending', 'submitted', 'ready', 'failed']),
    assetId: z.string().min(1).optional(),
    reservationId: z.string().min(1).optional(),
    billing: z.enum(['none', 'reserved', 'settled', 'released']),
    errorCode: z.string().max(200).optional(),
  })
  .strict();
export const assetJournalSchema = z
  .array(assetOperationSchema)
  .max(ASSET_JOURNAL_CAPACITY);
export type AssetOperation = z.infer<typeof assetOperationSchema>;

export function isLiveAssetOperation(op: AssetOperation): boolean {
  return op.state === 'pending' || op.state === 'submitted';
}

/** Appends operations, dropping the oldest terminal ones past capacity. */
export function appendAssetOperations(
  journal: readonly AssetOperation[],
  added: readonly AssetOperation[],
): AssetOperation[] {
  const next = [...journal, ...added];
  let excess = next.length - ASSET_JOURNAL_CAPACITY;
  return next.filter((op) => {
    if (excess <= 0 || isLiveAssetOperation(op)) return true;
    excess -= 1;
    return false;
  });
}

/** Every asset generation still on the journal, for the public run. */
export function projectAssetGenerations(
  journal: readonly AssetOperation[] | undefined,
): StoryboardAssetGeneration[] | undefined {
  if (!journal?.length) return undefined;
  return journal.map((op) =>
    storyboardAssetGenerationSchema.parse({
      operationId: op.operationId,
      entryId: op.entryId,
      action: op.action,
      modelKey: op.modelKey,
      state: op.state,
      assetId: op.assetId,
      credits: op.credits,
      billingMode: op.billingMode,
      errorCode: op.errorCode,
      updatedAt: op.updatedAt,
    }),
  );
}

/** One image to generate for an entry. */
export interface AssetRequestItem {
  prompt: string;
  referenceAssetIds: string[];
}

/** The images one generation call makes, and the recipe step that makes them. */
export interface AssetRequestPlan {
  /** The realistic-video recipe step whose model runs the call. */
  stepId: string;
  aspectRatio: string;
  items: AssetRequestItem[];
}

function castName(plan: StoryboardPlan, entry: StoryboardAssetEntry) {
  return (
    plan.cast.find((member) => member.id === entry.castMemberId)?.name ??
    entry.label
  );
}

function brief(entry: StoryboardAssetEntry): string {
  return entry.brief?.trim() ? `: ${entry.brief.trim()}` : '';
}

function chosen(entry: StoryboardAssetEntry): string {
  if (!entry.chosenAssetId)
    throw new BadRequestException(`Choose an image for ${entry.label} first.`);
  return entry.chosenAssetId;
}

/** A real person's photo: their face entry's chosen image, else this entry's own. */
function personPhoto(plan: StoryboardPlan, entry: StoryboardAssetEntry) {
  const face = (plan.assetBible ?? []).find(
    (other) =>
      other.kind === 'character_face' &&
      other.castMemberId === entry.castMemberId &&
      entry.castMemberId !== undefined,
  );
  const photo = face?.chosenAssetId ?? entry.sourceAssetIds[0];
  if (!photo)
    throw new BadRequestException(
      `Add a photo of ${castName(plan, entry)} before the costume swap.`,
    );
  return photo;
}

function variantItem(
  plan: StoryboardPlan,
  entry: StoryboardAssetEntry,
): Omit<AssetRequestPlan, 'items'> & { item: AssetRequestItem } {
  const references = entry.sourceAssetIds;
  switch (entry.kind) {
    case 'character_body':
      return {
        stepId: 'character-design',
        aspectRatio: '16:9',
        item: {
          prompt: composeCharacterSheetPrompt({
            description: `${castName(plan, entry)}${brief(entry)}`,
            environment: entry.sheetEnvironment ?? 'outdoor',
          }),
          referenceAssetIds: references,
        },
      };
    case 'character_face':
      return {
        stepId: 'character-design',
        aspectRatio: '1:1',
        item: {
          prompt: `Close portrait photograph of ${castName(plan, entry)}${brief(entry)}. Natural skin texture, soft daylight, plain background, looking at the camera.`,
          referenceAssetIds: references,
        },
      };
    case 'prop':
      return {
        stepId: 'props',
        aspectRatio: '1:1',
        item: {
          prompt: `Product design reference of ${entry.label}${brief(entry)}. One object, centered, plain surroundings, realistic materials, no text.`,
          referenceAssetIds: references,
        },
      };
    case 'environment':
      return {
        stepId: 'environment',
        aspectRatio: plan.format,
        item: {
          prompt: `Empty ${entry.label}${brief(entry)}. No people. Natural light, realistic photograph, the whole space in view.`,
          referenceAssetIds: references,
        },
      };
  }
}

/**
 * What a generation call makes for an entry (#9616). Prompts are fixed
 * templates so a quote is reproducible: the same request always prices and
 * renders the same images.
 */
export function planAssetRequest(
  plan: StoryboardPlan,
  entry: StoryboardAssetEntry,
  request: Pick<
    QuoteStoryboardAssets,
    'action' | 'count' | 'angles' | 'instruction'
  >,
): AssetRequestPlan {
  switch (request.action) {
    case 'variants': {
      const { item, ...rest } = variantItem(plan, entry);
      return {
        ...rest,
        items: Array.from({ length: request.count ?? 2 }, () => item),
      };
    }
    case 'angles': {
      if (!request.angles?.length)
        throw new BadRequestException('Name at least one angle.');
      const base = chosen(entry);
      const subject =
        entry.kind === 'character_body' || entry.kind === 'character_face'
          ? castName(plan, entry)
          : entry.label;
      return {
        stepId: 'asset-angles',
        aspectRatio: entry.kind === 'environment' ? plan.format : '1:1',
        items: request.angles.map((angle) => ({
          prompt: `The same ${subject} as in image 1, seen from ${angle}. Keep its shape, materials, colors and every detail exactly.`,
          referenceAssetIds: [base],
        })),
      };
    }
    case 'costume': {
      if (entry.kind !== 'character_body')
        throw new BadRequestException(
          'Only a character body takes a costume swap.',
        );
      const costume = chosen(entry);
      const setting =
        (entry.sheetEnvironment ?? 'outdoor') === 'outdoor'
          ? 'an empty outdoor setting in natural daylight'
          : 'a neutral studio';
      return {
        stepId: 'character-realism',
        aspectRatio: '3:4',
        items: [
          {
            prompt: `Dress the person in image 1 in the costume from image 2. Keep their face, hair, body and skin exactly as in image 1. Full body, standing in ${setting}.`,
            referenceAssetIds: [personPhoto(plan, entry), costume],
          },
        ],
      };
    }
    case 'edit': {
      if (entry.kind !== 'environment')
        throw new BadRequestException('Only an environment takes an edit.');
      if (!request.instruction)
        throw new BadRequestException('Say what to change.');
      return {
        stepId: 'environment-edit',
        aspectRatio: plan.format,
        items: [
          {
            prompt: `${request.instruction.trim()} Keep the layout, perspective, structure and lighting of image 1.`,
            referenceAssetIds: [chosen(entry)],
          },
        ],
      };
    }
  }
}

/**
 * Adds a rendered image to its entry's variants. The first image an entry
 * gets is also chosen, so a fresh entry is usable at once.
 */
export function addAssetVariant(
  plan: StoryboardPlan,
  entryId: string,
  assetId: string,
): StoryboardPlan {
  return {
    ...plan,
    assetBible: (plan.assetBible ?? []).map((entry) => {
      if (entry.id !== entryId || entry.variantAssetIds.includes(assetId))
        return entry;
      // A full entry drops its oldest variant that is not the chosen one.
      const dropped =
        entry.variantAssetIds.length >=
        STORYBOARD_ASSET_BIBLE_LIMITS.maxVariants
          ? entry.variantAssetIds.find((id) => id !== entry.chosenAssetId)
          : undefined;
      return {
        ...entry,
        variantAssetIds: [
          ...entry.variantAssetIds.filter((id) => id !== dropped),
          assetId,
        ],
        chosenAssetId: entry.chosenAssetId ?? assetId,
      };
    }),
  };
}

/**
 * Variants are server-owned: an edit keeps every variant the server recorded,
 * including ones that landed after the editor loaded, and never adds one. A
 * choice must be one of the entry's images.
 */
export function mergeAssetBibleEdit(
  previous: StoryboardPlan['assetBible'],
  submitted: StoryboardPlan['assetBible'],
): StoryboardPlan['assetBible'] {
  if (!submitted) return previous?.length ? previous : undefined;
  const old = new Map((previous ?? []).map((entry) => [entry.id, entry]));
  return submitted.map((entry) => {
    const variantAssetIds = old.get(entry.id)?.variantAssetIds ?? [];
    const isOwn = (id: string | undefined) =>
      id !== undefined &&
      (variantAssetIds.includes(id) || entry.sourceAssetIds.includes(id));
    const chosenAssetId = isOwn(entry.chosenAssetId)
      ? entry.chosenAssetId
      : undefined;
    const { chosenAssetId: _submitted, ...rest } = entry;
    return {
      ...rest,
      variantAssetIds,
      ...(chosenAssetId ? { chosenAssetId } : {}),
    };
  });
}
