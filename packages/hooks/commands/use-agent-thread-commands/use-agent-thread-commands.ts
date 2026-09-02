'use client';

import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { useCommandPalette } from '@hooks/ui/use-command-palette/use-command-palette';
import { MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

export interface AgentThreadCommandItem {
  id: string;
  title?: string;
  lastMessage?: string;
}

export interface UseAgentThreadCommandsOptions {
  threads: AgentThreadCommandItem[];
  onNavigate: (path: string) => void;
  enabled?: boolean;
}

function hasCommandThreadId(thread: AgentThreadCommandItem): boolean {
  return (
    typeof thread.id === 'string' &&
    thread.id.trim().length > 0 &&
    thread.id !== 'undefined' &&
    thread.id !== 'null'
  );
}

export function useAgentThreadCommands({
  threads,
  onNavigate,
  enabled = true,
}: UseAgentThreadCommandsOptions): void {
  const { registerCommands, unregisterCommands } = useCommandPalette();

  const previousCommandsRef = useRef<Map<string, ICommand>>(new Map());

  const commands = useMemo<ICommand[]>(
    () =>
      threads.filter(hasCommandThreadId).map((thread) => {
        const title = thread.title || 'Untitled Thread';
        const titleWords = title.toLowerCase().split(/\s+/);

        return {
          action: () => onNavigate(`/agent/${thread.id}`),
          category: 'navigation' as const,
          description: thread.lastMessage,
          icon: MessageSquare,
          id: `agent-thread-${thread.id}`,
          keywords: ['thread', 'chat', 'agent', ...titleWords],
          label: title,
        };
      }),
    [threads, onNavigate],
  );

  useEffect(() => {
    const previousCommands = previousCommandsRef.current;

    if (!enabled || commands.length === 0) {
      if (previousCommands.size > 0) {
        unregisterCommands([...previousCommands.keys()]);
      }

      previousCommandsRef.current = new Map();
      return;
    }

    const nextCommands = new Map(
      commands.map((command) => [command.id, command]),
    );
    const removedIds: string[] = [];
    const nextToRegister: ICommand[] = [];

    for (const commandId of previousCommands.keys()) {
      if (!nextCommands.has(commandId)) {
        removedIds.push(commandId);
      }
    }

    for (const [commandId, command] of nextCommands.entries()) {
      const previousCommand = previousCommands.get(commandId);

      if (!previousCommand) {
        nextToRegister.push(command);
        continue;
      }

      if (
        previousCommand.label !== command.label ||
        previousCommand.description !== command.description ||
        previousCommand.keywords?.join('|') !== command.keywords?.join('|')
      ) {
        removedIds.push(commandId);
        nextToRegister.push(command);
      }
    }

    if (removedIds.length > 0) {
      unregisterCommands(removedIds);
    }

    if (nextToRegister.length > 0) {
      registerCommands(nextToRegister);
    }

    previousCommandsRef.current = nextCommands;
  }, [commands, enabled, registerCommands, unregisterCommands]);

  useEffect(() => {
    return () => {
      const registeredIds = [...previousCommandsRef.current.keys()];
      if (registeredIds.length > 0) {
        unregisterCommands(registeredIds);
      }

      previousCommandsRef.current = new Map();
    };
  }, [unregisterCommands]);
}
