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

  /** Immutable version whose instructions were injected. */
  contentHash?: string;

  /** Immutable version executed for this resolution. */
  versionId?: string;
}

export interface PinnedRuntimeSkill {
  contentHash: string;
  instructions: string;
  slug: string;
  versionId: string;
}

/** What one skill added to a generation prompt: the sections, not the whole body. */
export interface SkillSectionReceipt {
  characters: number;
  compilerVersion: string;
  contentHash?: string;
  /** Headings kept whole; `preamble` is the intro above the first heading. */
  loadedSections: string[];
  modality?: string;
  /** Headings left out because they were off-plan or over the budget. */
  omittedSections: string[];
  slug: string;
  versionId?: string;
}

export interface ResolveActiveSkillsContext {
  actorUserId?: string;
  /** Empty array collects pins. A non-empty array is the retry source. */
  pinnedSkills?: PinnedRuntimeSkill[];
  agentType?: string;
  channel?: string;
  modality?: string;
  /**
   * Skills the operator picked explicitly for this turn from the composer's
   * `/` palette. Accessible enabled selections temporarily add to persistent
   * brand guidance without changing the brand's saved configuration.
   */
  requestedSkillSlugs?: string[];
  /** Collects what each skill loaded into a generation prompt. */
  sectionReceipts?: SkillSectionReceipt[];
  workflowStage?: string;
}
