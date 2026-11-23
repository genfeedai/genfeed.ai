import { createHash } from 'node:crypto';
import {
  sanitizeAgentUntrustedInput,
  UNTRUSTED_USER_DATA_FRAMING,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import {
  AGENT_EVENT_RUN_DAILY_CAP_DEFAULT,
  AGENT_EVENT_RUN_DAILY_CAP_MAX,
  AGENT_EVENT_TEXT_MAX_LENGTH,
} from './agent-event-run.constants';

/**
 * The identity of one event for one agent. An event that carries its own id is
 * the same event whenever it arrives. One that does not (a webhook body) is
 * told apart by its text within a UTC day, so a daily digest that repeats word
 * for word still starts one run a day. Only the digest is stored, never the text.
 */
export function buildAgentEventKey(input: {
  eventId?: string;
  eventText: string;
  now?: Date;
}): string {
  const eventId = input.eventId?.trim();
  const identity = eventId
    ? `id:${eventId}`
    : `text:${(input.now ?? new Date()).toISOString().slice(0, 10)}:${input.eventText.trim()}`;
  return createHash('sha256').update(identity).digest('hex');
}

/**
 * The agent's brief: the builder's instruction as written, then the event text
 * fenced as quoted data. The event is cleaned of instruction-like phrases and
 * cut short, and nothing in it picks the agent, its tools, its brand, its
 * budget or whether it may publish: those come from the strategy and the step.
 */
export function buildAgentEventObjective(input: {
  eventText: string;
  instruction: string;
}): string {
  const eventText = sanitizeAgentUntrustedInput(
    input.eventText,
    AGENT_EVENT_TEXT_MAX_LENGTH,
  );
  const instruction = input.instruction.trim();
  return eventText
    ? `${instruction}\n\n${UNTRUSTED_USER_DATA_FRAMING}\n${eventText}`
    : instruction;
}

export function resolveAgentEventDailyCap(value: unknown): number {
  const cap = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  if (!Number.isFinite(cap) || cap < 1) {
    return AGENT_EVENT_RUN_DAILY_CAP_DEFAULT;
  }
  return Math.min(cap, AGENT_EVENT_RUN_DAILY_CAP_MAX);
}
