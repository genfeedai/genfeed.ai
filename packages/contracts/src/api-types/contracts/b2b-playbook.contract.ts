import { z } from 'zod';

export const b2bPlaybookFormats = [
  'product-explainer-clip',
  'founder-talking-clip',
  'customer-quote-card',
  'stat-insight-card',
  'case-study-slide',
  'ad-variation',
] as const;

export const b2bReferenceRoles = [
  'product_frame',
  'brand_style',
  'brand_logo',
  'person',
  'screen_content',
  'voiceover',
] as const;

export const b2bReferenceSlotSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    label: z.string().min(1).max(100),
    role: z.enum(b2bReferenceRoles),
    kind: z.enum(['image', 'video', 'audio']),
    isRequired: z.boolean(),
    // Where the default comes from: the brand's scanned Library assets, or an
    // ingredient the user picks. Third-party media is never a default.
    defaultSource: z.enum(['brand-scan', 'library']),
  })
  .strict();

export const b2bPlaybookShotSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    title: z.string().min(1).max(100),
    direction: z.string().min(1).max(600),
    durationSeconds: z.number().positive().max(60).optional(),
  })
  .strict();

/** A playbook is a preset that carries its own structure, not just a style. */
export const b2bPlaybookSchema = z
  .object({
    key: z.string().min(1).max(160),
    label: z.string().min(1).max(160),
    description: z.string().max(1000),
    format: z.enum(b2bPlaybookFormats),
    mediaType: z.enum(['image', 'video']),
    aspectRatio: z.string().regex(/^[1-9]\d*:[1-9]\d*$/),
    hookFormula: z.string().min(1).max(600),
    shots: z.array(b2bPlaybookShotSchema).min(1).max(8),
    referenceSlots: z.array(b2bReferenceSlotSchema).max(12),
    evaluationCriteria: z.array(z.string().min(1).max(300)).min(1).max(12),
    allowedModels: z.array(z.string().min(1).max(160)).min(1).max(12),
  })
  .strict()
  .superRefine((playbook, context) => {
    const slotKeys = playbook.referenceSlots.map((slot) => slot.key);
    if (new Set(slotKeys).size !== slotKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Reference slot keys must be unique',
        path: ['referenceSlots'],
      });
    }
    const shotKeys = playbook.shots.map((shot) => shot.key);
    if (new Set(shotKeys).size !== shotKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Shot keys must be unique',
        path: ['shots'],
      });
    }
  });

/** Assets the user or the brand defaults attached, keyed by the slot they fill. */
export const b2bPlaybookAttachmentSchema = z
  .object({
    slotKey: z.string().min(1),
    kind: z.enum(['image', 'video', 'audio']),
    ingredientId: z.string().min(1).optional(),
  })
  .strict();

export type B2bPlaybook = z.infer<typeof b2bPlaybookSchema>;
export type B2bPlaybookFormat = (typeof b2bPlaybookFormats)[number];
export type B2bReferenceRole = (typeof b2bReferenceRoles)[number];
export type B2bReferenceSlot = z.infer<typeof b2bReferenceSlotSchema>;
export type B2bPlaybookAttachment = z.infer<typeof b2bPlaybookAttachmentSchema>;
