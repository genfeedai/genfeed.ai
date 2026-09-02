export interface AgentStreamStartEvent {
  conversationId: string;
  userId: string;
  model: string;
  timestamp: string;
}

export interface AgentTokenEvent {
  conversationId: string;
  userId: string;
  token: string;
  timestamp: string;
}

export interface AgentReasoningEvent {
  conversationId: string;
  userId: string;
  content: string;
  timestamp: string;
}

export interface AgentToolStartEvent {
  conversationId: string;
  userId: string;
  toolName: string;
  toolCallId: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

export interface AgentToolCompleteEvent {
  conversationId: string;
  userId: string;
  toolName: string;
  toolCallId: string;
  status: 'completed' | 'failed';
  creditsUsed: number;
  durationMs: number;
  error?: string;
  timestamp: string;
}

export interface AgentDoneEvent {
  conversationId: string;
  userId: string;
  fullContent: string;
  creditsUsed: number;
  creditsRemaining: number;
  toolCalls: Array<{
    toolName: string;
    status: 'completed' | 'failed';
    creditsUsed: number;
    durationMs: number;
    error?: string;
  }>;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AgentErrorEvent {
  conversationId: string;
  userId: string;
  error: string;
  timestamp: string;
}

export interface AgentToolProgressEvent {
  organizationId: string;
  userId: string;
  toolName: string;
  step: string;
  progress: number; // 0-1
  timestamp: string;
}
