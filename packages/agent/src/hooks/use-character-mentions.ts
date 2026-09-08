import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentCharacterMentionItem } from '@genfeedai/contracts/interfaces';
import { CHARACTERS_CHANGED_EVENT } from '@genfeedai/helpers/content/character-mention.util';
import { useEffect, useState } from 'react';

export function useCharacterMentions(apiService: AgentApiService | null): {
  isLoading: boolean;
  mentions: AgentCharacterMentionItem[];
} {
  const [mentions, setMentions] = useState<AgentCharacterMentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(CHARACTERS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHARACTERS_CHANGED_EVENT, refresh);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision refreshes the catalog after a character is saved
  useEffect(() => {
    if (!apiService || typeof apiService.getCharacterMentions !== 'function') {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    apiService
      .getCharacterMentions(controller.signal)
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
  }, [apiService, revision]);

  return { isLoading, mentions };
}
