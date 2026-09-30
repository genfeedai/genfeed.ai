import { createHash } from 'node:crypto';
import { VISUAL_CODE_LIMITS } from '@genfeedai/contracts/constants';
import type {
  ICreateVisualProject,
  IExportVisualProject,
  IRetryVisualProject,
  IReviseVisualProject,
  IVisualCodeSettings,
} from '@genfeedai/contracts/interfaces';
import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';

const bytes = (maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        Boolean(value.trim()) && Buffer.byteLength(value, 'utf8') <= maximum,
      'Expected nonblank text within UTF-8 byte limit.',
    );
const requestId = z.string().trim().min(1).max(VISUAL_CODE_LIMITS.requestId);
const maximumCredits = z.number().finite().nonnegative();
const positive = z.number().int().positive();
export const visualSettingsSchema = z
  .strictObject({
    width: z.number().int().min(256).max(1920).multipleOf(2),
    height: z.number().int().min(256).max(1920).multipleOf(2),
    fps: z.union([z.literal(24), z.literal(30)]),
    durationFrames: positive.max(900),
  })
  .refine(
    (value) =>
      value.width * value.height <= 1920 * 1080 &&
      value.durationFrames / value.fps <= 30,
    'Visual settings exceed pixel or duration limit.',
  );
const props = z
  .record(z.string(), z.json())
  .refine(
    (value) =>
      Buffer.byteLength(JSON.stringify(value)) <= VISUAL_CODE_LIMITS.propsBytes,
    'Props exceed UTF-8 byte limit.',
  );
const assets = z
  .array(z.string().trim().min(1))
  .max(12)
  .refine(
    (value) => new Set(value).size === value.length,
    'Asset IDs must be unique.',
  );
const output = z.strictObject({
  format: z.enum(['mp4', 'png', 'jpeg']),
  frame: z.number().int().nonnegative().optional(),
});
const outputs = z
  .array(output)
  .min(1)
  .max(8)
  .refine(
    (values) =>
      new Set(values.map((value) => `${value.format}-${value.frame ?? ''}`))
        .size === values.length &&
      values.filter((value) => value.format === 'mp4').length <= 1,
    'Outputs must be unique.',
  );
const createSchema = z
  .strictObject({
    brandId: z.string().trim().min(1),
    requestId,
    label: z.string().trim().min(1).max(120),
    prompt: bytes(VISUAL_CODE_LIMITS.promptBytes).optional(),
    sourceCode: bytes(VISUAL_CODE_LIMITS.sourceBytes).optional(),
    modelKey: z.string().trim().min(1).optional(),
    settings: visualSettingsSchema,
    props: props.default({}),
    sourceAssetIds: assets.default([]),
    outputs: outputs.default([{ format: 'mp4' }]),
    maximumCredits,
  })
  .refine(
    (value) =>
      Number(value.prompt !== undefined) +
        Number(value.sourceCode !== undefined) ===
      1,
    'Supply exactly one prompt or source.',
  );
const revisionSchema = z
  .strictObject({
    requestId,
    expectedRevision: positive,
    prompt: bytes(VISUAL_CODE_LIMITS.promptBytes).optional(),
    sourceCode: bytes(VISUAL_CODE_LIMITS.sourceBytes).optional(),
    props: props.optional(),
    maximumCredits,
  })
  .refine(
    (value) =>
      Number(value.prompt !== undefined) +
        Number(value.sourceCode !== undefined) +
        Number(value.props !== undefined) ===
      1,
    'Supply exactly one prompt, source or props change.',
  );
const exportSchema = z.strictObject({
  requestId,
  expectedRevision: positive,
  revision: positive,
  outputs: outputs.default([{ format: 'mp4' }]),
  maximumCredits,
});
const retrySchema = z.strictObject({
  requestId,
  revision: positive,
  expectedRevision: positive,
  maximumCredits,
});
export function validateOutputs(value: unknown, settings: IVisualCodeSettings) {
  const parsed = outputs.parse(value);
  for (const item of parsed)
    if (
      item.format === 'mp4'
        ? item.frame !== undefined
        : item.frame === undefined || item.frame >= settings.durationFrames
    )
      throw new UnprocessableEntityException('invalid_output_frame');
  return parsed;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new UnprocessableEntityException({
      code: 'visual_code_input_invalid',
      violations: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return result.data;
}
export function parseCreate(value: unknown): ICreateVisualProject {
  const input = parse(createSchema, value);
  validateOutputs(input.outputs, input.settings);
  return input;
}
export function parseRevision(value: unknown): IReviseVisualProject {
  return parse(revisionSchema, value);
}
export function parseExport(
  value: unknown,
  settings: IVisualCodeSettings,
): IExportVisualProject & Required<Pick<IExportVisualProject, 'outputs'>> {
  const input = parse(exportSchema, value);
  validateOutputs(input.outputs, settings);
  return input;
}
export function parseRetry(value: unknown): IRetryVisualProject {
  return parse(retrySchema, value);
}
export function visualInputHash(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .filter(([, entry]) => entry !== undefined)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, entry]) => [key, normalize(entry)]),
          )
        : item;
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}
