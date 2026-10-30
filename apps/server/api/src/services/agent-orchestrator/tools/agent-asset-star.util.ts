import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { canEditAssetTags } from '@api/collections/ingredients/utils/ingredient-tag-edit-access.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

function failure(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}

/**
 * Stars or unstars a Library asset for `star_asset`. Fails closed like
 * `rate_ingredient`: only an asset in the caller's own organization is
 * changed, so a foreign or unknown id never reaches the update. The caller must
 * also be allowed to edit the asset (the rule behind the tag and trash
 * routes), so another member's personal asset answers "not found" as well.
 */
export async function starLibraryAsset(
  ingredientsService: Pick<IngredientsService, 'findOne' | 'patch'>,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<AgentToolResult> {
  const assetId =
    typeof params.assetId === 'string' ? params.assetId.trim() : '';
  if (!assetId) {
    return failure('star_asset requires assetId.');
  }
  if (params.isStarred !== undefined && typeof params.isStarred !== 'boolean') {
    return failure('isStarred must be true or false.');
  }
  const isStarred = params.isStarred ?? true;

  const asset = await ingredientsService.findOne({
    id: assetId,
    isDeleted: false,
    organizationId: ctx.organizationId,
  });
  if (
    !asset ||
    !canEditAssetTags(asset, {
      brandId: ctx.brandId,
      userIds: [ctx.userId],
    })
  ) {
    return failure(`Asset ${assetId} was not found.`);
  }

  await ingredientsService.patch(assetId, { isFavorite: isStarred });

  return {
    creditsUsed: 0,
    data: { assetId, isStarred },
    success: true,
  };
}
