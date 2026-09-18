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
   * `/` palette. Narrowed to the brand's enabled set — asking for a skill the
   * brand has switched off does not switch it back on.
   */
  requestedSkillSlugs?: string[];
  workflowStage?: string;
}
