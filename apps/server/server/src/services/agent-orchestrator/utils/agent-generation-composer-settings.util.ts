import type { AgentGenerationSettings } from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';

const SETTINGS_PREFIX =
  'Use these operator-selected generation settings exactly: ';

export function extractAgentGenerationSettings(
  draftInstructions?: string,
): AgentGenerationSettings | undefined {
  const settingsLine = draftInstructions
    ?.split('\n')
    .find((line) => line.startsWith(SETTINGS_PREFIX));
  if (!settingsLine) return undefined;

  try {
    const candidate = JSON.parse(
      settingsLine.slice(SETTINGS_PREFIX.length),
    ) as Record<string, unknown>;
    if (
      typeof candidate.aspectRatio !== 'string' ||
      candidate.aspectRatio.trim().length === 0
    ) {
      return undefined;
    }

    return {
      aspectRatio: candidate.aspectRatio.trim(),
      ...(typeof candidate.duration === 'number' &&
      Number.isFinite(candidate.duration) &&
      candidate.duration > 0
        ? { duration: candidate.duration }
        : {}),
      ...(typeof candidate.model === 'string' &&
      candidate.model.trim().length > 0
        ? { model: candidate.model.trim() }
        : {}),
      ...(typeof candidate.outputs === 'number' &&
      Number.isFinite(candidate.outputs)
        ? {
            outputs: Math.min(8, Math.max(1, Math.round(candidate.outputs))),
          }
        : {}),
    };
  } catch {
    return undefined;
  }
}
