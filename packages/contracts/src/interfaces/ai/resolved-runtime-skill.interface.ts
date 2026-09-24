export type RuntimeSkillSource =
  | 'built_in'
  | 'custom'
  | 'customized'
  | 'imported';

export interface ResolvedRuntimeSkill {
  /** Skill display name */
  name: string;

  /** Unique skill identifier */
  slug: string;

  /** Instructions to inject into the agent system prompt */
  instructions: string;

  /** Tool names this skill adds to the agent's available tools */
  toolOverrides: string[];

  /** Catalog provenance. Built-in first-party skills are trusted product content. */
  source?: RuntimeSkillSource;

  /** True when this skill is a catalog-global built-in identity. */
  isBuiltIn?: boolean;
}

export interface ResolveActiveSkillsContext {
  agentType?: string;
  channel?: string;
  modality?: string;
  /**
   * Skills the operator picked explicitly for this turn from the composer's
   * `/` palette. Accessible enabled selections temporarily add to persistent
   * brand guidance without changing the brand's saved configuration.
   */
  requestedSkillSlugs?: string[];
  workflowStage?: string;
}
