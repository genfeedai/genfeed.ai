import type { GenerationPromptAuthor } from '@genfeedai/contracts/interfaces';

/**
 * Who wrote the text a Studio surface submits (#7341), given the agent draft
 * it was last seeded from: `agent` when it is the draft as seeded,
 * `agent_edited` when the member changed it first. Undefined means the member
 * wrote it: there was no draft, or the text is empty.
 */
export function resolveAgentPromptAuthor(
  agentText: string | null,
  text: string,
): GenerationPromptAuthor | undefined {
  if (agentText === null) return undefined;
  const submitted = text.trim();
  if (!submitted) return undefined;
  return submitted === agentText.trim() ? 'agent' : 'agent_edited';
}
