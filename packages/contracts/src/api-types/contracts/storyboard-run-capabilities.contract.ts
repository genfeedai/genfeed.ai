import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

export const storyboardModelKeySchema = z.string().trim().min(1).max(255);

export const storyboardCapabilityReasonSchema = z.enum([
  'MODEL_UNAVAILABLE',
  'MODEL_DISABLED',
  'MODEL_RETIRED',
  'MODEL_CAPABILITIES_UNAVAILABLE',
  'MODEL_DURATIONS_UNAVAILABLE',
  'FORMAT_UNSUPPORTED',
  'NO_ELIGIBLE_VIDEO_MODEL',
]);
export const storyboardVideoModelCapabilitySchema = z
  .object({
    key: storyboardModelKeySchema,
    label: z.string(),
    provider: z.string().min(1),
    supportedDurationsSeconds: z
      .array(z.number().finite().positive().max(60))
      .min(1)
      .refine(
        (values) =>
          values.every(
            (value, index) => index === 0 || value > values[index - 1],
          ),
        'Durations must be unique and ascending',
      ),
    defaultDurationSeconds: z.number().finite().positive().max(60).nullable(),
    hasInterpolation: z.boolean(),
    supportedFormats: z.array(z.enum(['9:16', '16:9', '1:1', '4:5'])),
    capabilitySource: z.enum(['catalog', 'registry']),
  })
  .strict()
  .refine(
    (model) =>
      model.defaultDurationSeconds === null ||
      model.supportedDurationsSeconds.includes(model.defaultDurationSeconds),
    'Default must be a supported duration',
  );
export const storyboardRunCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    runId: storyboardIdSchema,
    runRevision: z.number().int().positive(),
    capabilityVersion: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['available', 'unavailable']),
    requestedModelKey: storyboardModelKeySchema.nullable(),
    effectiveModel: storyboardVideoModelCapabilitySchema.nullable(),
    eligibleModels: z.array(storyboardVideoModelCapabilitySchema),
    reasonCode: storyboardCapabilityReasonSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.status === 'available'
        ? value.effectiveModel !== null && value.reasonCode === null
        : value.reasonCode !== null,
    'Availability must agree with effective model and reason',
  );
export type CapabilityReason = z.infer<typeof storyboardCapabilityReasonSchema>;
export type StoryboardVideoModelCapability = z.infer<
  typeof storyboardVideoModelCapabilitySchema
>;
export type StoryboardRunCapabilities = z.infer<
  typeof storyboardRunCapabilitiesSchema
>;
