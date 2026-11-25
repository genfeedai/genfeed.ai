import { z } from 'zod';
import { learningContractIdSchema as id } from './content-learning-generation.contract';

/** Building blocks shared by the branded-generation rule schemas. */
export const ids = z
  .array(id)
  .max(256)
  .refine((v) => new Set(v).size === v.length, 'Duplicate IDs');
export const refs = ids.min(1);
export const text = z.string().max(16000);
const voiceLabel = z.string().min(1).max(512);

/** How an approved brand sounds. Text generation reads it; image and video prompts do not. */
export const brandVoiceV1Schema = z.strictObject({
  tone: text.optional(),
  style: text.optional(),
  audience: z.array(voiceLabel).max(128),
  values: z.array(voiceLabel).max(128),
  messagingPillars: z.array(text).max(128),
  avoid: z.array(text).max(64),
  sample: text.optional(),
  guidelines: text.optional(),
});

export function issue(ctx: z.RefinementCtx, message: string) {
  ctx.addIssue({ code: 'custom', message });
}

export function keyed<T extends z.ZodType<{ id: string }>>(
  schema: T,
  max: number,
) {
  return z
    .array(schema)
    .max(max)
    .refine(
      (v) => new Set(v.map((x) => x.id)).size === v.length,
      'Duplicate keyed IDs',
    );
}

export const brandGenerationMediaKindV1Schema = z.enum([
  'text',
  'image',
  'video',
]);
export const applicableMediaKinds = z
  .array(brandGenerationMediaKindV1Schema)
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length, 'Duplicate media kinds');

export const brandTextRuleV1Schema = z.strictObject({
  id,
  text,
  match: z.enum(['literal', 'semantic']),
  required: z.boolean(),
  appliesToMediaKinds: applicableMediaKinds.optional(),
  evidenceIds: refs,
});
