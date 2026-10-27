export interface SkillExecutionContext {
  organizationId: string;
  brandId: string;
  brandVoice: string;
  platforms: string[];
  memory?: Record<string, unknown>;
  /** The acting user of the workflow run; brand access is checked for them. */
  userId?: string;
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
