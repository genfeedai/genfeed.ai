import type {
  AgentToolCall,
  AgentWorkEvent,
} from '@cloud/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';

interface StreamStateLike {
  activeToolCalls: AgentToolCall[];
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
}

export interface StreamingProgressSummary {
  detail?: string;
  label: string;
}

const ACTIVE_WORK_STATUSES = new Set([
  AgentWorkEventStatus.PENDING,
  AgentWorkEventStatus.RUNNING,
]);

function summarizeToolName(toolName: string): string {
  if (
    toolName.startsWith('get_') ||
    toolName.startsWith('list_') ||
    toolName.startsWith('discover_') ||
    toolName === 'resolve_handle'
  ) {
    return 'Researching';
  }

  if (
    toolName.startsWith('rate_') ||
    toolName.includes('review') ||
    toolName.includes('analytics')
  ) {
    return 'Reviewing';
  }

  if (toolName.startsWith('generate_') || toolName === 'create_post') {
    return 'Generating';
  }

  if (
    toolName.startsWith('prepare_') ||
    toolName.startsWith('execute_') ||
    toolName === 'schedule_post' ||
    toolName === 'open_studio_handoff'
  ) {
    return 'Preparing outputs';
  }

  if (toolName.startsWith('connect_') || toolName.startsWith('create_')) {
    return 'Updating workspace';
  }

  return 'Thinking';
}

function summarizeReasoning(reasoning: string): string | undefined {
  const cleaned = reasoning
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .find(Boolean);

  if (!cleaned) {
    return undefined;
  }

  if (cleaned.length <= 88) {
    return cleaned;
  }

  return `${cleaned.slice(0, 85).trimEnd()}...`;
}

export function summarizeStreamingProgress(
  streamState: StreamStateLike,
  workEvents: AgentWorkEvent[],
): StreamingProgressSummary {
  const latestActiveEvent = [...workEvents]
    .reverse()
    .find((event) => ACTIVE_WORK_STATUSES.has(event.status));

  if (latestActiveEvent?.event === AgentWorkEventType.INPUT_REQUESTED) {
    return {
      detail: latestActiveEvent.detail,
      label: 'Waiting for input',
    };
  }

  const latestToolName =
    [...streamState.activeToolCalls]
      .reverse()
      .find((toolCall) => toolCall.status !== 'completed')?.name ??
    latestActiveEvent?.toolName;

  if (latestToolName) {
    return {
      detail: latestActiveEvent?.detail,
      label: summarizeToolName(latestToolName),
    };
  }

  if (latestActiveEvent?.event === AgentWorkEventType.INPUT_SUBMITTED) {
    return {
      detail: latestActiveEvent.detail,
      label: 'Reviewing',
    };
  }

  if (streamState.streamingContent.trim().length > 0) {
    return { label: 'Answering' };
  }

  const reasoningSummary = summarizeReasoning(streamState.streamingReasoning);
  if (reasoningSummary) {
    return {
      detail: reasoningSummary,
      label: 'Thinking',
    };
  }

  return { label: 'Thinking' };
}
