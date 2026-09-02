import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentCharacterMentionItem } from '@genfeedai/contracts/interfaces';
import { useEffect, useState } from 'react';

export function useCharacterMentions(apiService: AgentApiService | null): {
  isLoading: boolean;
  mentions: AgentCharacterMentionItem[];
} {
  const [mentions, setMentions] = useState<AgentCharacterMentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (
      !apiService ||
      typeof apiService.getCharacterMentionsEffect !== 'function'
    ) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    runAgentApiEffect(apiService.getCharacterMentionsEffect(controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) {
          setMentions(data ?? []);
        }
      })
      .catch(() => {
        // Mentions are optional.
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
