import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';

export function buildPersistedAgentResponseMetadata(
  metadata: Record<string, unknown>,
  creditsRemaining: number,
  runId: string | undefined,
  usage?: OpenRouterChatCompletionResponse['usage'],
): Record<string, unknown> {
  return {
    creditsRemaining,
    ...metadata,
    ...(runId ? { runId } : {}),
    ...(usage
      ? {
          tokenUsage: {
            completion: usage.completion_tokens,
            prompt: usage.prompt_tokens,
            total: usage.total_tokens,
          },
        }
      : {}),
  };
}
