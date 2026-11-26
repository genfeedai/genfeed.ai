import { getToolByName } from '@genfeedai/actions';
import type {
  BrandKitApprovalDraft,
  BrandKitClient,
  BrandKitSection,
} from '@mcp/services/client/brand-kit.client';
import { z } from 'zod';

const SECTION_NAMES = {
  identity: 'brand name',
  visual_identity: 'visual identity',
  writing_voice: 'writing voice',
  strategy: 'strategy',
} satisfies Record<BrandKitSection, string>;

const sectionEditInput = z.strictObject({
  action: z.enum(['identity', 'visual_identity', 'writing_voice', 'strategy']),
  brandId: z.string().trim().min(1),
  fields: z
    .record(z.string(), z.unknown())
    .refine(
      (fields) => Object.keys(fields).length > 0,
      'At least one Brand Kit field is required',
    ),
});

const approveInput = z
  .strictObject({
    action: z.literal('approve'),
    brandId: z.string().trim().min(1),
    confirmed: z.boolean().optional(),
    revisionId: z.string().trim().min(1).optional(),
    updatedAt: z.string().trim().min(1).optional(),
  })
  .refine(
    ({ confirmed, revisionId, updatedAt }) =>
      confirmed !== true || (revisionId && updatedAt),
    'Confirming needs the revisionId and updatedAt from the first call, unchanged',
  );

const brandKitEditInput = z.discriminatedUnion('action', [
  sectionEditInput,
  approveInput,
]);

type BrandKitToolClient = Pick<
  BrandKitClient,
  'approveDraft' | 'getApprovalDraft' | 'updateSection'
>;

export function filterBrandKitTools<T extends { name: string }>(
  tools: T[],
  hasEditAccess?: boolean,
): T[] {
  return hasEditAccess
    ? tools
    : tools.filter(({ name }) => getToolByName(name)?.toolset !== 'brand-kit');
}

function toolResult(
  data: Record<string, unknown>,
  text: string,
): {
  content: Array<{ text: string; type: 'text' }>;
  structuredContent: { data: Record<string, unknown> };
} {
  return {
    structuredContent: { data },
    content: [{ type: 'text' as const, text }],
  };
}

/** What the person is asked to confirm, or why the draft cannot be approved here. */
function approvalPreview(brandId: string, draft: BrandKitApprovalDraft) {
  const data = { action: 'approve', approved: false, brandId, draft };
  if (draft.needsWebReview)
    return toolResult(
      data,
      'Nothing was approved. This draft carries generation rules that must be read in full, so the owner approves it in the Genfeed web app (Settings, Brand Kit).',
    );
  if (!draft.name)
    return toolResult(
      data,
      'Nothing was approved. The draft has no brand name yet. Set it first with action identity and a label, then ask again.',
    );
  return toolResult(
    data,
    `Nothing was approved yet. Show the person the brand name "${draft.name}"${draft.description ? ` and description "${draft.description}"` : ''} (draft version ${draft.version}) and ask them to confirm, in this conversation, that this Brand Kit becomes the approved one. Only after they agree, repeat this call with confirmed true and the same revisionId ${draft.revisionId} and updatedAt ${draft.updatedAt}. Never set confirmed on your own.`,
  );
}

export async function handleBrandKitTool(
  client: BrandKitToolClient,
  args: Record<string, unknown>,
) {
  const input = brandKitEditInput.parse(args);
  if (input.action === 'approve') {
    const { brandId, confirmed, revisionId, updatedAt } = input;
    if (confirmed !== true)
      return approvalPreview(brandId, await client.getApprovalDraft(brandId));
    await client.approveDraft(brandId, {
      revisionId: revisionId ?? '',
      updatedAt: updatedAt ?? '',
    });
    return toolResult(
      { action: 'approve', approved: true, brandId, revisionId },
      'Approved the Brand Kit. Branded generation for this brand now uses it.',
    );
  }
  const { action, brandId, fields } = input;
  await client.updateSection(brandId, action, fields);
  return toolResult(
    { action, brandId, updatedFields: Object.keys(fields) },
    `Saved the Brand Kit ${SECTION_NAMES[action]}.`,
  );
}
