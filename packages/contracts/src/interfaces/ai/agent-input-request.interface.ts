export interface AgentInputRequestPublishParams {
  allowFreeText?: boolean;
  isMultiSelect?: boolean;
  maxSelections?: number;
  threadId: string;
  fieldId?: string;
  inputRequestId: string;
  metadata?: Record<string, unknown>;
  options?: AgentInputRequestOption[];
  prompt: string;
  recommendedOptionId?: string;
  runId?: string;
  title: string;
  userId: string;
}

export interface AgentInputRequestOption {
  description?: string;
  id: string;
  label: string;
}

export interface AgentInputRequestResponsePayload {
  answer: string;
  optionIds?: string[];
  brandId?: string | null;
  expectedContextVersion?: number;
}

export interface ResolveAgentInputRequestParams {
  brandId?: string;
  contextVersion?: number;
  threadId: string;
  organizationId: string;
  requestId: string;
  answer: string;
  optionIds?: string[];
  userId: string;
}
