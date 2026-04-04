import type {
  AgentApiService,
  CredentialMentionItem,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useEffect, useState } from 'react';

interface UseCredentialMentionsReturn {
  mentions: CredentialMentionItem[];
  isLoading: boolean;
}

export function useCredentialMentions(
  apiService: AgentApiService | null,
): UseCredentialMentionsReturn {
  const [mentions, setMentions] = useState<CredentialMentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiService) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    runAgentApiEffect(apiService.getMentionsEffect(controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) {
          setMentions(data);
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
