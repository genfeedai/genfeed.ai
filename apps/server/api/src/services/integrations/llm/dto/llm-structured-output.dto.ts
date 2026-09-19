import type { OpenRouterChatCompletionParams } from '@api/services/integrations/openrouter/dto/openrouter.dto';
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
  /** Zod schema the model output is validated against. */
  schema: ZodType<TResult>;
  /** Stable schema name sent to the provider and reported in failures. */
  schemaName: string;
}
