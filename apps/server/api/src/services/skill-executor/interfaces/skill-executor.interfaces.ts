export interface SkillExecutionContext {
  organizationId: string;
  brandId: string;
  brandVoice: string;
  platforms: string[];
  memory?: Record<string, unknown>;
}

export interface ContentDraft {
  type: string;
  content: string;
  mediaUrls?: string[];
  platforms: string[];
  metadata: Record<string, unknown>;
  skillSlug: string;
  confidence?: number;
}

export interface ContentDraftInput {
  type: string;
  content: string;
  mediaUrls?: string[];
  platforms?: string[];
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface SkillExecutionResult {
  draft: ContentDraft;
  duration: number;
  creditsUsed: number;
  source: 'byok' | 'hosted';
}

export interface GatewayExecutionContext {
  organizationId: string;
  brandId: string;
  signalType: string;
}

export interface GatewayExecutionResult {
  runId: string;
  drafts: ContentDraftInput[];
}

export interface SkillHandler {
  execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<ContentDraft>;
}
