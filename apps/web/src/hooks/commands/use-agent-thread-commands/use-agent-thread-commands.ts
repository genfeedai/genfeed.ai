'use client';

import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useCommandPalette } from '@/hooks/ui/use-command-palette/use-command-palette';

const WHITESPACE_RUN_PATTERN = /\s+/;

interface AgentThreadCommandItem {
  id: string;
  title?: string;
  lastMessage?: string;
}

export interface UseAgentThreadCommandsOptions {
  threads: AgentThreadCommandItem[];
  onNavigate: (path: string) => void;
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
}: UseAgentThreadCommandsOptions): void {
  const { registerCommands, unregisterCommands } = useCommandPalette();

  const previousCommandsRef = useRef<Map<string, ICommand>>(new Map());

  const commands = useMemo<ICommand[]>(
    () =>
      threads.filter(hasCommandThreadId).map((thread) => {
        const title = thread.title || 'Untitled Thread';
        const titleWords = title.toLowerCase().split(WHITESPACE_RUN_PATTERN);

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

  // use-effect-audit: ignore registers the commands with the command palette
  useEffect(() => {
    const previousCommands = previousCommandsRef.current;

    if (commands.length === 0) {
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
  }, [commands, registerCommands, unregisterCommands]);

  // use-effect-audit: ignore releases timers, requests or subscriptions on unmount
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
