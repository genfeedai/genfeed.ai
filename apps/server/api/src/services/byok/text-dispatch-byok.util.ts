import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { ByokProvider } from '@genfeedai/contracts';
import { ConflictException } from '@nestjs/common';

export type TextDispatchByokProvider =
  | ByokProvider.OPENROUTER
  | ByokProvider.REPLICATE;

/**
 * The org's own keys that pay for a text request's provider calls (#5380).
 * Present only when credits were bypassed for that request, and carried in
 * memory only — never in workflow `inputValues`, node outputs or logs.
 */
export interface TextByokDispatch {
  readonly keys: Readonly<Partial<Record<TextDispatchByokProvider, string>>>;
}

/**
 * Called by a service once it has resolved the model it is about to
 * dispatch: settles the request's BYOK-vs-credits decision for that model
 * and returns the key to dispatch with (`undefined` = platform key, credits).
 */
export type TextDispatchKeyResolver = (
  model: string,
) => Promise<string | undefined>;

/**
 * The BYOK provider whose key `ReplicateService.generateTextCompletionSync`
 * actually dispatches `model` with: OpenRouter for OpenRouter-routed text
 * models, the Replicate prediction client for everything else. Keyed off the
 * same `isOpenRouterTextModel` predicate as dispatch, never the catalog row's
 * provider — `anthropic/*` rows complete through OpenRouter, not Anthropic.
 */
export function resolveTextDispatchByokProvider(
  model: string,
): TextDispatchByokProvider {
  return isOpenRouterTextModel(model)
    ? ByokProvider.OPENROUTER
    : ByokProvider.REPLICATE;
}

/**
 * The key to dispatch `model` with. `undefined` means credits were charged
 * and the platform key pays. A bypassed request whose model now routes to a
 * provider it holds no key for fails closed rather than silently falling back
 * to the platform key uncharged.
 */
export function textDispatchApiKey(
  dispatch: TextByokDispatch | undefined,
  model: string,
): string | undefined {
  if (!dispatch) {
    return undefined;
  }
  const key = dispatch.keys[resolveTextDispatchByokProvider(model)];
  if (!key) {
    throw new ConflictException(
      'The text model changed after billing was decided. Retry the request.',
    );
  }
  return key;
}
