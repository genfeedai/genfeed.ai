/**
 * Default-values builder for the shared Unified Generation Setup store
 * (`@genfeedai/ui` `generation-setup.store.ts`), scoped to the Agent's
 * `GenerationActionCard` review (#4672 — image/video only; there is no more
 * Type/Agent-pick/Brand-voice/Prompt-enhance control to source other fields
 * from). Studio owns its own generation-setup bridge and does not import
 * this file.
 */
import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';

const AGENT_GENERATION_DEFAULT_ASPECT_RATIO: Record<'image' | 'video', string> =
  {
    image: '1:1',
    video: '16:9',
  };

/**
 * Seeds a fresh, fully agent-owned setup for a scope that has never been
 * written. `modelKey` defaults to `''` (Auto — the server `RouterService`
 * resolves the model). `isPromptEnhanceEnabled` is a required field on the
 * shared `GenerationSetupValues` shape but is otherwise inert here — the
 * Agent has no Prompt Enhance control and nothing reads this value back out.
 */
export function buildDefaultAgentGenerationSetupValues(
  type: 'image' | 'video',
  modelKey = '',
): GenerationSetupValues {
  return {
    aspectRatio: AGENT_GENERATION_DEFAULT_ASPECT_RATIO[type],
    brandingMode: 'brand',
    duration: type === 'video' ? 5 : undefined,
    isPromptEnhanceEnabled: true,
    modelKey,
    outputs: 1,
    prioritize: RouterPriority.BALANCED,
    type,
  };
}
