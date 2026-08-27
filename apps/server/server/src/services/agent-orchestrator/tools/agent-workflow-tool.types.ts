export type OfficialWorkflowSourceKind =
  | 'generated'
  | 'marketplace-listing'
  | 'seeded-template'
  | 'system-catalog';

export interface OfficialWorkflowSource {
  confidence: number;
  description?: string;
  id: string;
  installedWorkflowId?: string;
  kind: OfficialWorkflowSourceKind;
  name: string;
  price?: number;
  pricingTier?: string;
  slug?: string;
}

export type RecurringTaskContentType =
  | 'image'
  | 'newsletter'
  | 'post'
  | 'video';

export interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

export interface RecurringScaffoldParams {
  contentType: RecurringTaskContentType;
  count: number;
  diversityMode: 'high' | 'low' | 'medium';
  negativePrompt: string;
  prompt: string;
  schedule: string;
  styleNotes: string;
  timezone: string;
}

export interface GeneratedWorkflowGraph {
  description: string | undefined;
  edges: Array<Record<string, unknown>> | undefined;
  nodes: Array<Record<string, unknown>> | undefined;
  workflowLabel: string;
}
