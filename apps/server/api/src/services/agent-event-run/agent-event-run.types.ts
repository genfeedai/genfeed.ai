export interface AgentEventRunRequest {
  /** Rolling-day cap on event-started runs for this agent. */
  dailyCap?: number;
  /** Id the source gave the event (a post id, a comment id). */
  eventId?: string;
  /** The event's own text: untrusted, only ever shown to the agent as quoted data. */
  eventText: string;
  /** What the agent should do with the event, written by whoever built the workflow. */
  instruction: string;
  organizationId: string;
  strategyId: string;
  userId: string;
  workflowExecutionId?: string;
  workflowId?: string;
}

export type AgentEventRunSkipReason =
  | 'budget_reached'
  | 'daily_cap_reached'
  | 'duplicate_event'
  | 'event_withheld';

export type AgentEventRunOutcome =
  | { agentExecutionId: string; started: true; threadId: string }
  | { reason: AgentEventRunSkipReason; started: false };

export type AgentEventClaim =
  | { kind: 'claimed'; runId: string }
  | { kind: 'duplicate' }
  | { kind: 'capped' };

/** The injection check on event text, bound by the module that owns the classifier. */
export interface AgentEventContentGate {
  isWithheld(input: {
    content: string;
    eventKey: string;
    executionId?: string;
    organizationId: string;
    strategyId: string;
    userId: string;
  }): Promise<boolean>;
}
