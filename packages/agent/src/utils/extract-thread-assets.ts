import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { extractThreadOutputs } from '@genfeedai/agent/utils/extract-thread-outputs';

export type ThreadAssetType = 'audio' | 'image' | 'video';

export interface ThreadAsset {
  assetId?: string;
  id: string;
  messageId: string;
  sourceActionId?: string;
  thumbnailUrl?: string;
  title?: string;
  type: ThreadAssetType;
  url: string;
}

function addAsset(map: Map<string, ThreadAsset>, asset: ThreadAsset): void {
  const dedupeKey = `${asset.type}:${asset.url}`;
  const existing = map.get(dedupeKey);
  if (!existing) {
    map.set(dedupeKey, asset);
  } else if (!existing.assetId && asset.assetId) {
    map.set(dedupeKey, { ...existing, assetId: asset.assetId });
  }
}

export function extractThreadAssets(
  messages: AgentChatMessage[],
): ThreadAsset[] {
  const assetsMap = new Map<string, ThreadAsset>();

  for (const group of extractThreadOutputs(messages)) {
    for (const variant of group.variants) {
      if (!variant.url || variant.kind === 'text') {
        continue;
      }

      addAsset(assetsMap, {
        id: variant.id,
        assetId: variant.assetId,
        messageId: group.messageId,
        sourceActionId: group.sourceActionId,
        thumbnailUrl: variant.thumbnailUrl,
        title: variant.title ?? group.title,
        type: variant.kind,
        url: variant.url,
      });
    }
  }

  return [...assetsMap.values()];
}
