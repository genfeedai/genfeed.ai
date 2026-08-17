import { AgentToolName } from '@genfeedai/interfaces';

/**
 * Direct generation tools run immediately and never paint a review card.
 * When the matching prepare tool is allowed, remap so the user gets a card
 * first — the same contract as image/video → `prepare_generation`.
 */
export function getGenerationPreparationRedirect(
  toolName: AgentToolName,
  allowedTools: Set<AgentToolName>,
): AgentToolName | null {
  const canPrepareGeneration = allowedTools.has(
    AgentToolName.PREPARE_GENERATION,
  );
  const isDirectVisualGenerationTool =
    toolName === AgentToolName.GENERATE_IMAGE ||
    toolName === AgentToolName.GENERATE_VIDEO ||
    toolName === AgentToolName.GENERATE_AS_IDENTITY;

  if (canPrepareGeneration && isDirectVisualGenerationTool) {
    return AgentToolName.PREPARE_GENERATION;
  }

  if (
    allowedTools.has(AgentToolName.PREPARE_VOICE_CLONE) &&
    toolName === AgentToolName.GENERATE_VOICE
  ) {
    return AgentToolName.PREPARE_VOICE_CLONE;
  }

  return null;
}
