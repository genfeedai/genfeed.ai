import type { ClipperReadinessContract } from '@genfeedai/contracts/interfaces';
import {
  CLIPPER_PROJECT_TERMINAL_STATUSES,
  CLIPPER_TERMINAL_STATUSES,
} from '@genfeedai/contracts/interfaces';

const terminalStatuses = new Set<string>(CLIPPER_TERMINAL_STATUSES);
const projectTerminalStatuses = new Set<string>(
  CLIPPER_PROJECT_TERMINAL_STATUSES,
);

export function isTerminalClipStatus(status: unknown): boolean {
  return typeof status === 'string' && terminalStatuses.has(status);
}

export function isTerminalClipperProjectStatus(status: unknown): boolean {
  return typeof status === 'string' && projectTerminalStatuses.has(status);
}

export function buildClipperProjectReadiness(input: {
  error?: string | null;
  status: string;
  terminalAt?: Date | string | null;
}): ClipperReadinessContract {
  if (input.status === 'completed' || input.status === 'partially-completed') {
    return {
      blockingReasons:
        input.status === 'partially-completed'
          ? [input.error || 'some-clipper-generations-failed']
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
      blockingReasons: [input.error || 'clipper-project-failed'],
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

export function buildClipperResultReadiness(input: {
  status: string;
  terminalAt?: Date | string | null;
}): ClipperReadinessContract {
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
      blockingReasons: ['clipper-result-failed'],
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
