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
            label: 'View in Library',
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
export function buildMediaAssetData(
  id: string,
  status: Status,
  url?: string,
): Record<string, unknown> {
  return url ? { id, status, url } : { id, status };
}
