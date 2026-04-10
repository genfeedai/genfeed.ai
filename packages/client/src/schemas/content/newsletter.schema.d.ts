import { z } from 'zod';
export declare const newsletterStatusSchema: z.ZodEnum<{
  draft: 'draft';
  proposed: 'proposed';
  ready_for_review: 'ready_for_review';
  approved: 'approved';
  published: 'published';
  archived: 'archived';
}>;
export declare const newsletterSourceTypeSchema: z.ZodEnum<{
  url: 'url';
  manual: 'manual';
  kb: 'kb';
  newsletter: 'newsletter';
}>;
export declare const newsletterSourceRefSchema: z.ZodObject<
  {
    label: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    sourceType: z.ZodEnum<{
      url: 'url';
      manual: 'manual';
      kb: 'kb';
      newsletter: 'newsletter';
    }>;
    url: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export declare const newsletterFormSchema: z.ZodObject<
  {
    angle: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    contextNewsletterIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    label: z.ZodString;
    sourceRefs: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            note: z.ZodOptional<z.ZodString>;
            sourceType: z.ZodEnum<{
              url: 'url';
              manual: 'manual';
              kb: 'kb';
              newsletter: 'newsletter';
            }>;
            url: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    status: z.ZodEnum<{
      draft: 'draft';
      proposed: 'proposed';
      ready_for_review: 'ready_for_review';
      approved: 'approved';
      published: 'published';
      archived: 'archived';
    }>;
    summary: z.ZodOptional<z.ZodString>;
    topic: z.ZodString;
  },
  z.core.$strip
>;
export type NewsletterFormSchema = z.infer<typeof newsletterFormSchema>;
//# sourceMappingURL=newsletter.schema.d.ts.map
