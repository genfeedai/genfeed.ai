import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { runAgentApiEffect } from '@cloud/agent/services/agent-base-api.service';
import type { TeamMentionItem } from '@cloud/agent/types/mention.types';
import { useEffect, useState } from 'react';

interface UseTeamMentionsReturn {
  mentions: TeamMentionItem[];
  isLoading: boolean;
}

export function useTeamMentions(
  apiService: AgentApiService | null,
): UseTeamMentionsReturn {
  const [mentions, setMentions] = useState<TeamMentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiService) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    // TODO: Create API endpoint GET /v1/team/mentions and add getTeamMentionsEffect to AgentApiService
    runAgentApiEffect(apiService.getTeamMentionsEffect(controller.signal))
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
