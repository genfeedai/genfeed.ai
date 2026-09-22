import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { RouterPriority } from '@genfeedai/contracts';

/**
 * One call into `AgentAutoModelResolverService.resolve()` (#4865).
 *
 * It carries both the turn state the decision judges and the identifiers
 * typed-decision telemetry records, so a shadow-mode row can be joined back
 * to the thread it came from.
 */
export interface AgentAutoRoutingResolveParams {
  brandId?: string;
  /** Platform default key — the web-search policy only applies on it. */
  defaultModelKey: string;
  hasPreviousRoundUsedTools: boolean;
  hasToolsAvailable: boolean;
  latestUserMessage: string;
  /** The model the turn requested, before any routing decision. */
  model: string;
  organizationId: string;
  prioritize?: RouterPriority;
  /** 1-based tool-calling round inside the turn. */
  roundNumber: number;
  runId?: string;
  source?: AgentChatRequest['source'];
  threadId: string;
  userId: string;
}
