import type {
  BrandKitClient,
  BrandKitSection,
} from '@mcp/services/client/brand-kit.client';
import { z } from 'zod';

const SECTION_NAMES = {
  visual_identity: 'visual identity',
  writing_voice: 'writing voice',
  strategy: 'strategy',
} satisfies Record<BrandKitSection, string>;

const brandKitEditInput = z.strictObject({
  action: z.enum(['visual_identity', 'writing_voice', 'strategy']),
  brandId: z.string().trim().min(1),
  fields: z
    .record(z.string(), z.unknown())
    .refine(
      (fields) => Object.keys(fields).length > 0,
      'At least one Brand Kit field is required',
    ),
});

export async function handleBrandKitTool(
  client: Pick<BrandKitClient, 'updateSection'>,
  args: Record<string, unknown>,
) {
  const { action, brandId, fields } = brandKitEditInput.parse(args);
  await client.updateSection(brandId, action, fields);
  return {
    structuredContent: { action, brandId, updatedFields: Object.keys(fields) },
    content: [
      {
        type: 'text' as const,
        text: `Saved the Brand Kit ${SECTION_NAMES[action]}.`,
      },
    ],
  };
}
