import { z } from 'zod';
export const exportFields = [
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
export const exportSchema = z.object({
  fields: z
    .array(z.enum(exportFields))
    .min(1, 'At least one field must be selected'),
  format: z.enum(['csv', 'xlsx']),
});
//# sourceMappingURL=export.schema.js.map
