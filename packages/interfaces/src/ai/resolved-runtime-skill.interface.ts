export interface ResolvedRuntimeSkill {
  /** Skill display name */
  name: string;

  /** Unique skill identifier */
  slug: string;

  /** Instructions to inject into the agent system prompt */
  instructions: string;

  /** Tool names this skill adds to the agent's available tools */
  toolOverrides: string[];
}
