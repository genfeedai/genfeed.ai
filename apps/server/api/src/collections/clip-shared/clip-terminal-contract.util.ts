import type { ClipReadinessContract } from '@genfeedai/interfaces';
import { CLIP_TERMINAL_STATUSES } from '@genfeedai/interfaces';

const terminalStatuses = new Set<string>(CLIP_TERMINAL_STATUSES);

export function isTerminalClipStatus(status: unknown): boolean {
  return typeof status === 'string' && terminalStatuses.has(status);
}

export function buildClipProjectReadiness(input: {
  error?: string | null;
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
      blockingReasons: [input.error || 'clip-project-failed'],
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
