import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { useEffect, useState } from 'react';

interface UseContentMentionsReturn {
  mentions: ContentMentionItem[];
  isLoading: boolean;
}

export function useContentMentions(
  apiService: AgentApiService | null,
): UseContentMentionsReturn {
  const [mentions, setMentions] = useState<ContentMentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiService || typeof apiService.getContentMentions !== 'function') {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    apiService
      .getContentMentions(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setMentions(data ?? []);
        }
      })
      .catch(() => {
        // Silently fail — mentions are optional
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [apiService]);

  return { isLoading, mentions };
}
