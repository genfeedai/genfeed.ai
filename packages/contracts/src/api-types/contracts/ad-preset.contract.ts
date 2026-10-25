import { z } from 'zod';

export const adPresetSectionKeys = [
  'goal',
  'no_words',
  'references',
  'dialogue',
  'subjects',
  'scale',
  'camera',
  'quality',
  'lighting',
  'performance',
  'events',
  'audio',
  'consistency',
] as const;
export const adPresetSchema = z
  .object({
    key: z.string().min(1).max(160),
    label: z.string().min(1).max(160),
    description: z.string().max(1000),
    speaking: z.boolean(),
    sections: z
      .array(
        z
          .object({
            key: z.enum(adPresetSectionKeys),
            title: z.string().min(1).max(100),
            template: z.string().min(1).max(10000),
          })
          .strict(),
      )
      .length(adPresetSectionKeys.length)
      .refine(
        (sections) =>
          sections.every(
            (section, index) => section.key === adPresetSectionKeys[index],
          ),
        'Sections must use the canonical order exactly once',
      ),
  })
  .strict();

export const adPresetParamsSchema = z
  .object({
    aspectRatio: z.string().regex(/^[1-9]\d*:[1-9]\d*$/),
    lensMm: z.number().positive().max(1200),
    qualityLook: z.string().min(1).max(500),
    // No trim or normalization: the submitted dialogue is preserved verbatim.
    dialogue: z.string().default(''),
    duration: z.number().optional(),
    referenceRoles: z
      .array(
        z
          .object({
            token: z.string().regex(/^@(Image|Video|Audio)[1-9]\d*$/),
            role: z.enum([
              'person',
              'location',
              'screen_content',
              'facial_driver',
              'voiceover',
            ]),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const adPresetSubmissionSchema = z
  .object({
    presetId: z.string().min(1).max(160),
    params: adPresetParamsSchema,
  })
  .strict();
export const adPresetReferenceSchema = z
  .object({
    token: z.string().regex(/^@(Image|Video|Audio)[1-9]\d*$/),
    kind: z.enum(['image', 'video', 'audio']),
    duration: z.number().optional(),
  })
  .strict();

export type AdPreset = z.infer<typeof adPresetSchema>;
export type AdPresetParams = z.infer<typeof adPresetParamsSchema>;
export type AdPresetSubmission = z.infer<typeof adPresetSubmissionSchema>;
export type AdPresetReference = z.infer<typeof adPresetReferenceSchema>;
