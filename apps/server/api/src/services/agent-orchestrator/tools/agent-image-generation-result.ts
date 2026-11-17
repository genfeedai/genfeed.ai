import { IMAGE_GENERATION_RESULT_ERROR } from '@api/services/agent-orchestrator/agent-image-generation-result.constant';
import {
  readMediaResponseString,
  readUsableCdnAssetUrl,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { IngredientCategory, Status } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export function buildImageGenerationResult(
  id: string,
  cdnUrl: string | undefined,
  promptPreview: string,
  onboardingNextActions: AgentToolResult['nextActions'],
): AgentToolResult {
  const status = cdnUrl ? Status.GENERATED : Status.PROCESSING;

  return {
    creditsUsed: 0,
    data: buildMediaAssetData(id, status, cdnUrl),
    isBillingDelegated: true,
    nextActions: [
      {
        ctas: [
          {
            href: createLibraryAssetRoute(IngredientCategory.IMAGE, id),
            label: 'View Library',
          },
        ],
        assetId: id,
        assetKind: 'image',
        description: `Image ${cdnUrl ? 'generated' : 'is generating'} from: "${promptPreview}"`,
        id: `image-gen-${id}`,
        images: cdnUrl ? [cdnUrl] : [],
        status: cdnUrl ? 'completed' : 'processing',
        title: cdnUrl ? 'Image generated' : 'Image generating',
        type: 'content_preview_card',
      },
      ...(onboardingNextActions ?? []),
    ],
    success: true,
  };
}
/** Only a render card for the dispatched asset can substantiate the chat receipt. */
export function approvedImageMessage(
  result: AgentToolResult,
): string | undefined {
  const id = result.data?.id;
  if (!result.success || typeof id !== 'string' || !id) return undefined;
  const preview = result.nextActions?.find(
    (card) =>
      card.type === 'content_preview_card' &&
      card.assetKind === 'image' &&
      card.assetId === id,
  );
  if (
    preview?.status === 'processing' &&
    result.data?.status === Status.PROCESSING
  )
    return 'Image queued. Follow its progress in the Library.';
  if (
    preview?.status === 'completed' &&
    result.data?.status === Status.GENERATED &&
    typeof result.data.url === 'string' &&
    preview.images?.includes(result.data.url)
  )
    return 'Image generated and saved to the Library.';
  return undefined;
}

export function buildMediaAssetData(
  id: string,
  status: Status,
  url?: string,
): Record<string, unknown> {
  return url ? { id, status, url } : { id, status };
}

export function readImageDispatchResult(
  response: Record<string, unknown>,
  endpoint: string,
): { id: string; cdnUrl?: string } | { id?: string; error: string } {
  const id = readMediaResponseString(response, 'id');
  if (!id) return { error: IMAGE_GENERATION_RESULT_ERROR.MISSING_ASSET_ID };
  const status = readMediaResponseString(response, 'status')
    ?.trim()
    .toLowerCase();
  if (
    status === Status.PROCESSING ||
    status === 'queued' ||
    status === 'pending'
  )
    return { id };
  if (
    status &&
    ![
      Status.GENERATED,
      Status.UPLOADED,
      Status.VALIDATED,
      Status.COMPLETED,
    ].some((done) => done === status)
  )
    return { id, error: 'Image generation did not complete.' };
  const cdnUrl = readUsableCdnAssetUrl(response, endpoint);
  return cdnUrl
    ? { id, cdnUrl }
    : { id, error: IMAGE_GENERATION_RESULT_ERROR.UNUSABLE_CDN_URL };
}
