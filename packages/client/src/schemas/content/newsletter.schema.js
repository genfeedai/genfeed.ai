import { z } from 'zod';
export const newsletterStatusSchema = z.enum([
  'proposed',
  'draft',
  'ready_for_review',
  'approved',
  'published',
  'archived',
]);
export const newsletterSourceTypeSchema = z.enum([
  'url',
  'manual',
  'kb',
  'newsletter',
]);
export const newsletterSourceRefSchema = z.object({
  label: z.string().min(1).max(160),
  note: z.string().max(1000).optional(),
  sourceType: newsletterSourceTypeSchema,
  url: z.string().url().optional(),
});
export const newsletterFormSchema = z.object({
  angle: z.string().max(200).optional(),
  content: z.string().optional(),
  contextNewsletterIds: z.array(z.string()).optional(),
  label: z.string().min(1).max(200),
  sourceRefs: z.array(newsletterSourceRefSchema).optional(),
  status: newsletterStatusSchema,
  summary: z.string().max(500).optional(),
  topic: z.string().min(1).max(200),
});
//# sourceMappingURL=newsletter.schema.js.map
