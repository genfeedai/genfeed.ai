import type { AiActionType } from '@genfeedai/enums';

export interface IAiActionRequest {
  action: AiActionType;
  content: string;
  context?: Record<string, string>;
}

export interface IAiActionResponse {
  result: string;
  tokensUsed: number;
}

export interface IAiActionConfig {
  action: AiActionType;
  label: string;
  description: string;
}
