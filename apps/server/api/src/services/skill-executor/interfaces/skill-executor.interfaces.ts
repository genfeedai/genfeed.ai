export interface SkillExecutionContext {
  organizationId: string;
  brandId: string;
  /**
   * The composed harness brief, resolved by the skill workflow for skills
   * that write brand copy. Callers never supply it.
   */
  brandBrief?: string;
  platforms: string[];
  memory?: Record<string, unknown>;
}

export interface GeneratedContent {
  type: string;
  content: string;
  mediaUrls?: string[];
  platforms: string[];
  metadata: Record<string, unknown>;
  skillSlug: string;
  confidence?: number;
}

export interface GeneratedContentInput {
  type: string;
  content: string;
  mediaUrls?: string[];
  platforms?: string[];
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface SkillExecutionResult {
  draft: GeneratedContent;
  duration: number;
  creditsUsed: number;
  executionId: string;
}

export interface SkillHandler {
  execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<GeneratedContent>;
}
