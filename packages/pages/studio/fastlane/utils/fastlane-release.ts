import {
  PostVisibility,
  parsePlatform,
  ReleaseStatus,
} from '@genfeedai/contracts';
import type { CreateReleaseGroupInput } from '@genfeedai/contracts/api-types/contracts';
import type { FastlaneReleaseBuildParams } from '../types';

export function buildFastlaneReleaseInput(
  params: FastlaneReleaseBuildParams,
): CreateReleaseGroupInput | null {
  const ingredientId = params.asset.ingredientId;
  if (!ingredientId) {
    return null;
  }

  const caption = params.caption.trim();
  const hook = params.asset.idea.hook.trim();
  const baseContent = caption || hook;
  if (!baseContent) {
    return null;
  }

  const targets: CreateReleaseGroupInput['targets'] = [];
  for (const [order, target] of params.targets.entries()) {
    const platform = parsePlatform(target.platform);
    if (!platform) {
      continue;
    }
    targets.push({
      credentialId: target.credentialId,
      order,
      platform,
      visibility: PostVisibility.PUBLIC,
    });
  }

  if (targets.length === 0) {
    return null;
  }

  const title = hook.slice(0, 100) || baseContent.slice(0, 100);
  const brandId = params.brandId.trim();

  return {
    baseContent,
    ...(brandId ? { brandId } : {}),
    media: [
      {
        assetId: ingredientId,
        kind: params.asset.idea.format === 'image' ? 'image' : 'video',
      },
    ],
    ...(params.postingSetId ? { postingSetId: params.postingSetId } : {}),
    status: ReleaseStatus.DRAFT,
    targets,
    timezone: params.timezone,
    title,
  };
}
