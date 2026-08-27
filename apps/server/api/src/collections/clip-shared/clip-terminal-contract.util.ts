import type { ClipReadinessContract } from '@genfeedai/interfaces';
import {
  CLIP_PROJECT_TERMINAL_STATUSES,
  CLIP_TERMINAL_STATUSES,
} from '@genfeedai/interfaces';

const terminalStatuses = new Set<string>(CLIP_TERMINAL_STATUSES);
const projectTerminalStatuses = new Set<string>(CLIP_PROJECT_TERMINAL_STATUSES);

export function isTerminalClipStatus(status: unknown): boolean {
  return typeof status === 'string' && terminalStatuses.has(status);
}

export function isTerminalClipProjectStatus(status: unknown): boolean {
  return typeof status === 'string' && projectTerminalStatuses.has(status);
}

export function buildClipProjectReadiness(input: {
  error?: string | null;
  status: string;
  terminalAt?: Date | string | null;
}): ClipReadinessContract {
  if (input.status === 'completed' || input.status === 'partially-completed') {
    return {
      blockingReasons:
        input.status === 'partially-completed'
          ? [input.error || 'some-clip-generations-failed']
          : [],
      readyActions:
        input.status === 'partially-completed'
          ? ['download', 'edit', 'publish', 'retry']
          : ['download', 'edit', 'publish'],
      state: input.status === 'partially-completed' ? 'blocked' : 'ready',
      terminal: true,
      terminalAt: toIsoString(input.terminalAt),
    };
  }

  if (input.status === 'failed') {
    return {
      blockingReasons: [input.error || 'clip-project-failed'],
      readyActions: ['retry'],
      state: 'failed',
      terminal: true,
      terminalAt: toIsoString(input.terminalAt),
    };
  }

  if (input.status === 'degraded') {
    return {
      blockingReasons: ['raw-cut-media-validation-failed'],
      readyActions: ['retry'],
      state: 'blocked',
      terminal: true,
      terminalAt: toIsoString(input.terminalAt),
    };
  }

  return {
    blockingReasons: [],
    readyActions: [],
    state: 'pending',
    terminal: false,
    terminalAt: null,
  };
}

export function buildClipResultReadiness(input: {
  status: string;
  terminalAt?: Date | string | null;
}): ClipReadinessContract {
  if (input.status === 'completed') {
    return {
      blockingReasons: [],
      readyActions: ['download', 'edit', 'publish'],
      state: 'ready',
      terminal: true,
      terminalAt: toIsoString(input.terminalAt),
    };
  }

  if (input.status === 'failed') {
    return {
      blockingReasons: ['clip-result-failed'],
      readyActions: ['retry'],
      state: 'failed',
      terminal: true,
      terminalAt: toIsoString(input.terminalAt),
    };
  }

  return {
    blockingReasons: [],
    readyActions: [],
    state: 'pending',
    terminal: false,
    terminalAt: null,
  };
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' && value.length > 0 ? value : null;
}
