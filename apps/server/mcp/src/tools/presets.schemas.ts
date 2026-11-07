import { z } from 'zod';

export const presetKinds = [
  'image',
  'image-edit',
  'video',
  'storyboard',
  'ad',
  'playbook',
  'cinematic-short',
] as const;

export const presetToolSchemas = {
  get_preset: z
    .object({
      brandName: z.string().trim().min(1).max(160).optional(),
      key: z.string().trim().min(1).max(160),
      slots: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  get_presets: z
    .object({
      kind: z.enum(presetKinds).optional(),
      search: z.string().trim().min(1).max(100).optional(),
    })
    .strict(),
};

export type PresetKind = (typeof presetKinds)[number];
export type PresetToolInput<Name extends keyof typeof presetToolSchemas> =
  z.infer<(typeof presetToolSchemas)[Name]>;
