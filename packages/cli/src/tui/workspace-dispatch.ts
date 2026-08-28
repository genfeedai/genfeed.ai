import type { ParsedSlashCommand } from './slash-command';
import { parseSlashCommand } from './slash-command';

export interface WorkspaceDispatchHandlers {
  appendError: (message: string) => void;
  runMessage: (value: string) => Promise<void>;
  runOperation: (command: ParsedSlashCommand) => Promise<void>;
}

export async function dispatchWorkspaceInput(
  value: string,
  handlers: WorkspaceDispatchHandlers
): Promise<void> {
  try {
    if (value.startsWith('/')) {
      await handlers.runOperation(parseSlashCommand(value));
      return;
    }
    await handlers.runMessage(value);
  } catch (error) {
    handlers.appendError(error instanceof Error ? error.message : String(error));
  }
}

export interface HistorySelection {
  index: number;
  value: string;
}

export function selectHistoryEntry(
  history: string[],
  currentIndex: number,
  direction: 'down' | 'up'
): HistorySelection {
  if (history.length === 0) return { index: -1, value: '' };
  const index =
    direction === 'up'
      ? Math.min(currentIndex + 1, history.length - 1)
      : Math.max(currentIndex - 1, -1);
  return {
    index,
    value: index < 0 ? '' : (history[history.length - 1 - index] ?? ''),
  };
}
