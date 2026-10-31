import type {
  AgentChatMessage,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';

export interface AgentThreadAsset {
  kind: 'image' | 'video' | 'other';
  url: string;
}

const VIDEO_EXTENSION = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

function kindOf(url: string, contentType?: string): AgentThreadAsset['kind'] {
  if (contentType === 'video' || VIDEO_EXTENSION.test(url)) {
    return 'video';
  }
  if (contentType === 'image' || IMAGE_EXTENSION.test(url)) {
    return 'image';
  }
  return 'other';
}

/**
 * What a thread produced: the media its assistant replies carry, then the
 * thread's latest generated asset, each once, in the order they were made.
 * Only http(s) URLs count, so nothing else can reach an image or link.
 */
export function collectThreadAssets(
  thread: Pick<AgentThread, 'lastGeneratedAssetUrl'>,
  messages: readonly Pick<AgentChatMessage, 'metadata' | 'role'>[],
): AgentThreadAsset[] {
  const assets = new Map<string, AgentThreadAsset>();
  const add = (url: string | null | undefined, contentType?: string) => {
    if (!url || assets.has(url) || !/^https?:\/\//i.test(url)) {
      return;
    }
    assets.set(url, { kind: kindOf(url, contentType), url });
  };

  for (const message of messages) {
    if (message.role === 'assistant') {
      add(message.metadata?.mediaUrl, message.metadata?.contentType);
    }
  }
  add(thread.lastGeneratedAssetUrl);

  return [...assets.values()];
}
