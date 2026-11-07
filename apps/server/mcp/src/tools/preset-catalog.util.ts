import {
  adPresetParamsSchema,
  adPresetSchema,
} from '@genfeedai/contracts/api-types/contracts/ad-preset.contract';
import { b2bPlaybookSchema } from '@genfeedai/contracts/api-types/contracts/b2b-playbook.contract';
import {
  cinematicShortSchema,
  cinematicShortSlotsSchema,
} from '@genfeedai/contracts/api-types/contracts/cinematic-short.contract';
import { compileCinematicShort } from '@genfeedai/contracts/constants/cinematic-short-compiler';
import { STORYBOARD_STARTER_PRESETS } from '@genfeedai/contracts/constants/storyboard-presets.constant';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { PresetKind } from '@mcp/tools/presets.schemas';
import { z } from 'zod';

export interface PresetSummary {
  description: string;
  key: string;
  kind: PresetKind;
  label: string;
  aspectRatio?: string;
  durationSeconds?: number;
}

const RESERVED_STORYBOARD_LABELS: Record<string, string> = {
  beforeAfter: 'Before and after',
  founderStory: 'Founder story',
  productLaunch: 'Product launch',
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A preset row is JSON:API `{ id, attributes }` or already flat. */
function attributesOf(row: unknown): Record<string, unknown> {
  if (!isRecord(row)) return {};
  return isRecord(row.attributes) ? row.attributes : row;
}

function kindOf(attributes: Record<string, unknown>): PresetKind | undefined {
  if (attributes.cinematicShort) return 'cinematic-short';
  if (attributes.adPreset) return 'ad';
  if (attributes.playbook) return 'playbook';
  if (attributes.category === 'image') return 'image';
  if (attributes.category === 'image-edit') return 'image-edit';
  if (attributes.category === 'video') return 'video';
  return undefined;
}

function summarizeRow(row: unknown): PresetSummary | undefined {
  const attributes = attributesOf(row);
  const kind = kindOf(attributes);
  const key = text(attributes.key);
  const label = text(attributes.label);
  if (!kind || !key || !label) return undefined;
  const aspectRatio = text(attributes.aspectRatio);
  const duration = attributes.duration;
  return {
    description: text(attributes.description) ?? '',
    key,
    kind,
    label,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(typeof duration === 'number' ? { durationSeconds: duration } : {}),
  };
}

function storyboardSummaries(): PresetSummary[] {
  return STORYBOARD_STARTER_PRESETS.map((preset) => ({
    aspectRatio: preset.format,
    description: preset.brief,
    durationSeconds: preset.runtimeBudgetSeconds,
    key: preset.id,
    kind: 'storyboard' as const,
    label: RESERVED_STORYBOARD_LABELS[preset.id] ?? preset.id,
  }));
}

/**
 * Every preset the caller can use: the catalog rows the API returns for the
 * caller (platform defaults plus their own) and the storyboard starters,
 * which ship in `@genfeedai/contracts` and are not stored rows.
 */
export function listPresetSummaries(
  rows: readonly unknown[],
  filter: { kind?: PresetKind; search?: string },
): PresetSummary[] {
  const needle = filter.search?.toLowerCase();
  return [
    ...rows.flatMap((row) => summarizeRow(row) ?? []),
    ...storyboardSummaries(),
  ].filter(
    (preset) =>
      (!filter.kind || preset.kind === filter.kind) &&
      (!needle ||
        `${preset.key} ${preset.label} ${preset.description}`
          .toLowerCase()
          .includes(needle)),
  );
}

export class PresetNotFoundError extends Error {
  constructor(key: string) {
    super(`No preset with key "${key}". Call get_presets to list the keys.`);
    this.name = 'PresetNotFoundError';
  }
}

export class PresetSlotsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresetSlotsError';
  }
}

/** One preset by key. The caller's own row wins over a platform row, as in the API. */
export function describePreset(
  rows: readonly unknown[],
  input: {
    brandName?: string;
    key: string;
    slots?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const matches = rows
    .map((row) => attributesOf(row))
    .filter((attributes) => attributes.key === input.key);
  const attributes =
    matches.find((candidate) => text(candidate.organizationId)) ?? matches[0];

  if (!attributes) {
    const starter = STORYBOARD_STARTER_PRESETS.find(
      (preset) => preset.id === input.key,
    );
    if (!starter) throw new PresetNotFoundError(input.key);
    if (input.slots)
      throw new PresetSlotsError(
        'Slots are only compiled for cinematic-short presets.',
      );
    return {
      ...storyboardSummaries().find((summary) => summary.key === input.key),
      brief: starter.brief,
      shotCount: starter.shotCount,
    };
  }

  const summary = summarizeRow(attributes);
  if (!summary) throw new PresetNotFoundError(input.key);

  if (attributes.cinematicShort) {
    const preset = cinematicShortSchema.safeParse(attributes.cinematicShort);
    if (!preset.success)
      throw new PresetSlotsError(
        `The stored preset "${input.key}" is not a valid cinematic short.`,
      );
    const detail = {
      ...summary,
      example: preset.data.example,
      fps: preset.data.fps,
      maxRuntimeSeconds: preset.data.maxRuntimeSeconds,
      qaPassLimit: preset.data.qaPassLimit,
      shots: preset.data.shots.map(
        ({ endSeconds, key, startSeconds, title }) => ({
          endSeconds,
          key,
          startSeconds,
          title,
        }),
      ),
      slotSchema: z.toJSONSchema(cinematicShortSlotsSchema),
    };
    if (!input.slots) return detail;
    const slots = cinematicShortSlotsSchema.safeParse(input.slots);
    if (!slots.success)
      throw new PresetSlotsError(
        `Invalid slots: ${slots.error.issues
          .map((issue) => `${issue.path.join('.') || 'slots'} ${issue.message}`)
          .join('; ')}`,
      );
    return {
      ...detail,
      compiled: compileCinematicShort({
        preset: preset.data,
        slots: slots.data,
        ...(input.brandName ? { brandName: input.brandName } : {}),
      }),
    };
  }

  if (input.slots)
    throw new PresetSlotsError(
      'Slots are only compiled for cinematic-short presets.',
    );
  if (attributes.adPreset) {
    const preset = adPresetSchema.safeParse(attributes.adPreset);
    return {
      ...summary,
      paramsSchema: z.toJSONSchema(adPresetParamsSchema),
      ...(preset.success ? { sections: preset.data.sections } : {}),
    };
  }
  if (attributes.playbook) {
    const playbook = b2bPlaybookSchema.safeParse(attributes.playbook);
    return {
      ...summary,
      ...(playbook.success ? { playbook: playbook.data } : {}),
    };
  }
  const {
    aspectRatio,
    camera,
    cameraMovement,
    duration,
    lens,
    lighting,
    mood,
    prompt,
    promptTemplate,
    scene,
    style,
  } = attributes;
  return {
    ...summary,
    prompt,
    values: {
      aspectRatio,
      camera,
      cameraMovement,
      duration,
      lens,
      lighting,
      mood,
      promptTemplate,
      scene,
      style,
    },
  };
}
