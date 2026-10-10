import { getActionOriginContext } from '@api/action-origin/action-origin.context';
import type { MediaGenerationReceiptOpenInputV1 } from '@api/services/media-generation-receipts/media-generation-receipts.types';
import { ActionOrigin } from '@genfeedai/contracts';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';

const SURFACE_BY_ORIGIN: Readonly<
  Record<ActionOrigin, MediaGenerationReceiptOpenInputV1['surface']>
> = {
  [ActionOrigin.AGENT]: 'agent',
  [ActionOrigin.API]: 'api',
  [ActionOrigin.CLI]: 'api',
  [ActionOrigin.MCP]: 'mcp',
  [ActionOrigin.UI]: 'studio',
  [ActionOrigin.UNKNOWN]: 'ui',
  [ActionOrigin.WORKFLOW]: 'workflow',
};

/** Receipt surface from the server-verified action origin of the current call. */
export function resolveMediaGenerationReceiptSurface(
  origin: ActionOrigin = getActionOriginContext().origin,
): MediaGenerationReceiptOpenInputV1['surface'] {
  return SURFACE_BY_ORIGIN[origin] ?? 'ui';
}

/**
 * The prompt evidence a media receipt retains: what the caller typed, the
 * enhancement output when enhancement ran, and the prompt the provider got.
 * `dispatched` lists provider-input candidates in precedence order.
 */
export function resolveMediaGenerationReceiptPrompts(input: {
  harness?: GenerationHarnessReceipt;
  fallbackPrompt: string;
  dispatched: readonly unknown[];
}): Pick<
  MediaGenerationReceiptOpenInputV1,
  'originalPrompt' | 'enhancedPrompt' | 'compiledPrompt'
> {
  const originalPrompt = input.harness?.originalPrompt ?? input.fallbackPrompt;
  const enhancedPrompt =
    input.harness?.status === 'applied'
      ? input.harness.enhancedPrompt
      : undefined;
  const dispatched = input.dispatched.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return {
    originalPrompt,
    ...(enhancedPrompt !== undefined ? { enhancedPrompt } : {}),
    compiledPrompt: dispatched ?? enhancedPrompt ?? originalPrompt,
  };
}
