import { z } from 'zod';
export declare const exportFields: readonly [
  'id',
  'title',
  'description',
  'status',
  'platform',
  'scheduledDate',
  'publicationDate',
  'views',
  'likes',
  'comments',
  'tags',
  'videoLabel',
  'videoDescription',
  'extension',
  'model',
  'style',
  'isRepeat',
  'repeatFrequency',
  'repeatInterval',
  'repeatCount',
  'maxRepeats',
  'createdAt',
  'updatedAt',
];
export declare const exportSchema: z.ZodObject<
  {
    fields: z.ZodArray<
      z.ZodEnum<{
        platform: 'platform';
        id: 'id';
        description: 'description';
        style: 'style';
        title: 'title';
        status: 'status';
        tags: 'tags';
        isRepeat: 'isRepeat';
        scheduledDate: 'scheduledDate';
        model: 'model';
        createdAt: 'createdAt';
        updatedAt: 'updatedAt';
        extension: 'extension';
        publicationDate: 'publicationDate';
        views: 'views';
        likes: 'likes';
        comments: 'comments';
        videoLabel: 'videoLabel';
        videoDescription: 'videoDescription';
        repeatFrequency: 'repeatFrequency';
        repeatInterval: 'repeatInterval';
        repeatCount: 'repeatCount';
        maxRepeats: 'maxRepeats';
      }>
    >;
    format: z.ZodEnum<{
      csv: 'csv';
      xlsx: 'xlsx';
    }>;
  },
  z.core.$strip
>;
export type ExportSchema = z.infer<typeof exportSchema>;
export type ExportField = (typeof exportFields)[number];
export type ExportFormat = 'csv' | 'xlsx';
//# sourceMappingURL=export.schema.d.ts.map
