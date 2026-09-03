/**
 * Per-turn media routing on the Agent composer send boundary.
 *
 * Domain-only — not a Prisma enum. `AUTO` is conversation (the model picks
 * tools). `IMAGE` / `VIDEO` skip the LLM and run `confirm_generate_media`.
 */
export enum AgentGenerationMode {
  AUTO = 'auto',
  IMAGE = 'image',
  VIDEO = 'video',
}

export function isExplicitAgentMediaGenerationMode(
  mode: AgentGenerationMode | string | undefined | null,
): mode is AgentGenerationMode.IMAGE | AgentGenerationMode.VIDEO {
  return (
    mode === AgentGenerationMode.IMAGE || mode === AgentGenerationMode.VIDEO
  );
}
