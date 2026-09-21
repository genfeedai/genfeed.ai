import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { ZodType } from 'zod';

/**
 * Parameters for {@link LlmDispatcherService.completeStructured}.
 *
 * The response format, tools and streaming are owned by the helper — the
 * schema is what the caller declares, and the helper decides how each provider
 * route expresses it.
 */
export interface LlmStructuredCompletionParams<TResult>
  extends Omit<
    OpenRouterChatCompletionParams,
    'response_format' | 'stream' | 'tool_choice' | 'tools'
  > {
  /**
   * Fires with every provider response, first attempt and repair alike, for
   * callers that report usage of their own. Telemetry is recorded by the
   * dispatcher either way.
   */
  onAttempt?: (
    response: OpenRouterChatCompletionResponse,
  ) => Promise<void> | void;
  /** Zod schema the model output is validated against. */
  schema: ZodType<TResult>;
  /** Stable schema name sent to the provider and reported in failures. */
  schemaName: string;
}
