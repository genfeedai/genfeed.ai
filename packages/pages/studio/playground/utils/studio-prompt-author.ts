import type { GenerationPromptAuthor } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';

/** The agent proposal the composer was last seeded from. */
export interface StudioAgentPromptSeed {
  text: string;
  type: StudioPlaygroundType;
}

/**
 * Who wrote the prompt being generated (#7341): `agent` when it is the
 * proposal as seeded, `agent_edited` when the member changed it first.
 * Undefined means the member wrote it, including after switching type.
 */
export function resolveStudioPromptAuthor(
  seed: StudioAgentPromptSeed | null,
  prompt: string,
  type: StudioPlaygroundType,
): GenerationPromptAuthor | undefined {
  if (!seed || seed.type !== type) return undefined;
  const text = prompt.trim();
  if (!text) return undefined;
  return text === seed.text.trim() ? 'agent' : 'agent_edited';
}
