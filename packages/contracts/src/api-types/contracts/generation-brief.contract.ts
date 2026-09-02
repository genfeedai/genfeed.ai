/**
 * Canonical generation brief contract.
 *
 * Image and video generation surfaces normalize authorized creative intent
 * into this versioned provider-agnostic contract before model compilation.
 * Provider capability profiles and dispatch payloads remain separate concerns.
 *
 * Foundation for parent issue #1650, bounded contract slice #2152.
 */

import { z } from 'zod';

export const generationBriefMediaKindValues = [
  'image',
  'text',
  'video',
] as const;

export const generationFidelityModeValues = [
  'off',
  'guided',
  'strict',
] as const;

export const generationReferenceRoleValues = [
  'subject',
  'character',
  'product',
  'style',
  'composition',
  'first_frame',
  'last_frame',
  'reference_video',
] as const;

export const imageGenerationReferenceRoleValues = [
  'subject',
  'character',
  'product',
  'style',
  'composition',
] as const satisfies readonly (typeof generationReferenceRoleValues)[number][];

export const generationConstraintKindValues = [
  'desired_outcome',
  'avoid',
  'exact_composition',
] as const;

export const generationBriefProvenanceSourceValues = [
  'user',
  'brand',
  'campaign',
  'platform',
  'performance',
  'continuity',
  'reference',
] as const;

export const unsupportedGenerationConstraintBehaviorValues = [
  'ignore',
  'warn',
  'reject',
] as const;

export const generationBriefMediaKindSchema = z.enum(
  generationBriefMediaKindValues,
);
export const generationFidelityModeSchema = z.enum(
  generationFidelityModeValues,
);
export const generationReferenceRoleSchema = z.enum(
  generationReferenceRoleValues,
);
export const imageGenerationReferenceRoleSchema = z.enum(
  imageGenerationReferenceRoleValues,
);
export const generationConstraintKindSchema = z.enum(
  generationConstraintKindValues,
);
export const generationBriefProvenanceSourceSchema = z.enum(
  generationBriefProvenanceSourceValues,
);
export const unsupportedGenerationConstraintBehaviorSchema = z.enum(
  unsupportedGenerationConstraintBehaviorValues,
);

const generationBriefIdSchema = z.string().trim().min(1).max(255);
const generationBriefTextSchema = z.string().trim().min(1).max(10_000);
const generationBriefShortTextSchema = z.string().trim().min(1).max(1_000);

export const generationFidelityPolicySchema = z
  .object({
    applyConstraints: z.boolean(),
    unsupportedConstraintBehavior:
      unsupportedGenerationConstraintBehaviorSchema,
  })
  .strict();

export type GenerationFidelityMode = z.infer<
  typeof generationFidelityModeSchema
>;
export type GenerationFidelityPolicy = z.infer<
  typeof generationFidelityPolicySchema
>;

export const generationFidelityPolicies = {
  guided: {
    applyConstraints: true,
    unsupportedConstraintBehavior: 'warn',
  },
  off: {
    applyConstraints: false,
    unsupportedConstraintBehavior: 'ignore',
  },
  strict: {
    applyConstraints: true,
    unsupportedConstraintBehavior: 'reject',
  },
} as const satisfies Readonly<
  Record<GenerationFidelityMode, GenerationFidelityPolicy>
>;

export const generationBriefConstraintSchema = z
  .object({
    kind: generationConstraintKindSchema,
    required: z.boolean().default(false),
    value: generationBriefShortTextSchema,
  })
  .strict();

export const generationBriefProvenanceSchema = z
  .object({
    field: generationBriefIdSchema,
    source: generationBriefProvenanceSourceSchema,
  })
  .strict();

const baseGenerationReferenceShape = {
  assetId: generationBriefIdSchema,
  description: generationBriefShortTextSchema.optional(),
};

export const generationBriefReferenceSchema = z
  .object({
    ...baseGenerationReferenceShape,
    role: generationReferenceRoleSchema,
  })
  .strict();

export const imageGenerationBriefReferenceSchema = z
  .object({
    ...baseGenerationReferenceShape,
    role: imageGenerationReferenceRoleSchema,
  })
  .strict();

export const generationBriefIntentSchema = z
  .object({
    composition: generationBriefShortTextSchema.optional(),
    lighting: generationBriefShortTextSchema.optional(),
    objective: generationBriefTextSchema,
    requestedText: z.array(generationBriefShortTextSchema).max(20).default([]),
    scene: generationBriefShortTextSchema.optional(),
    subjects: z.array(generationBriefShortTextSchema).max(20).default([]),
    visualDirection: generationBriefShortTextSchema.optional(),
  })
  .strict();

export const videoGenerationBriefIntentSchema = generationBriefIntentSchema
  .extend({
    audioDirection: generationBriefShortTextSchema.optional(),
    cinematography: generationBriefShortTextSchema.optional(),
    motion: generationBriefShortTextSchema.optional(),
  })
  .strict();

export const imageGenerationBriefOutputSchema = z
  .object({
    aspectRatio: z
      .string()
      .regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/)
      .optional(),
    height: z.number().int().positive().max(16_384).optional(),
    width: z.number().int().positive().max(16_384).optional(),
  })
  .strict()
  .superRefine((output, context) => {
    if ((output.width === undefined) !== (output.height === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Generation brief output width and height must be paired.',
        path: ['width'],
      });
    }
  });

export const videoGenerationBriefOutputSchema = imageGenerationBriefOutputSchema
  .safeExtend({
    durationSeconds: z.number().positive().max(300).optional(),
    resolution: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

const generationBriefBaseShape = {
  constraints: z.array(generationBriefConstraintSchema).max(100).default([]),
  fidelityMode: generationFidelityModeSchema,
  provenance: z.array(generationBriefProvenanceSchema).max(100).default([]),
  version: z.literal(1),
};

export const imageGenerationBriefSchema = z
  .object({
    ...generationBriefBaseShape,
    intent: generationBriefIntentSchema,
    mediaKind: z.literal('image'),
    output: imageGenerationBriefOutputSchema,
    references: z
      .array(imageGenerationBriefReferenceSchema)
      .max(20)
      .default([]),
  })
  .strict();

export const videoGenerationBriefSchema = z
  .object({
    ...generationBriefBaseShape,
    intent: videoGenerationBriefIntentSchema,
    mediaKind: z.literal('video'),
    output: videoGenerationBriefOutputSchema,
    references: z.array(generationBriefReferenceSchema).max(20).default([]),
  })
  .strict();

export const textGenerationBriefSchema = z
  .object({
    ...generationBriefBaseShape,
    intent: generationBriefIntentSchema,
    mediaKind: z.literal('text'),
    output: z.object({}).strict(),
    references: z.array(generationBriefReferenceSchema).max(20).default([]),
  })
  .strict();

export const generationBriefSchema = z.discriminatedUnion('mediaKind', [
  imageGenerationBriefSchema,
  textGenerationBriefSchema,
  videoGenerationBriefSchema,
]);

export type GenerationBriefMediaKind = z.infer<
  typeof generationBriefMediaKindSchema
>;
export type GenerationReferenceRole = z.infer<
  typeof generationReferenceRoleSchema
>;
export type ImageGenerationReferenceRole = z.infer<
  typeof imageGenerationReferenceRoleSchema
>;
export type GenerationConstraintKind = z.infer<
  typeof generationConstraintKindSchema
>;
export type GenerationBriefProvenanceSource = z.infer<
  typeof generationBriefProvenanceSourceSchema
>;
export type UnsupportedGenerationConstraintBehavior = z.infer<
  typeof unsupportedGenerationConstraintBehaviorSchema
>;
export type GenerationBriefConstraint = z.infer<
  typeof generationBriefConstraintSchema
>;
export type GenerationBriefProvenance = z.infer<
  typeof generationBriefProvenanceSchema
>;
export type GenerationBriefReference = z.infer<
  typeof generationBriefReferenceSchema
>;
export type ImageGenerationBriefReference = z.infer<
  typeof imageGenerationBriefReferenceSchema
>;
export type GenerationBriefIntent = z.infer<typeof generationBriefIntentSchema>;
export type VideoGenerationBriefIntent = z.infer<
  typeof videoGenerationBriefIntentSchema
>;
export type ImageGenerationBriefOutput = z.infer<
  typeof imageGenerationBriefOutputSchema
>;
export type VideoGenerationBriefOutput = z.infer<
  typeof videoGenerationBriefOutputSchema
>;
export type ImageGenerationBrief = z.infer<typeof imageGenerationBriefSchema>;
export type TextGenerationBrief = z.infer<typeof textGenerationBriefSchema>;
export type VideoGenerationBrief = z.infer<typeof videoGenerationBriefSchema>;
export type GenerationBrief = z.infer<typeof generationBriefSchema>;
