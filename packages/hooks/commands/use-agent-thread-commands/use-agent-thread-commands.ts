'use client';

import type { ICommand } from '@cloud/interfaces/ui/command-palette.interface';
import { useCommandPalette } from '@hooks/ui/use-command-palette/use-command-palette';
import { useEffect, useMemo, useRef } from 'react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';

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

export function useAgentThreadCommands({
  threads,
  onNavigate,
  enabled = true,
}: UseAgentThreadCommandsOptions): void {
  const { registerCommand, unregisterCommand } = useCommandPalette();

  const previousCommandsRef = useRef<Map<string, ICommand>>(new Map());

  const commands = useMemo<ICommand[]>(
    () =>
      threads.map((thread) => {
        const title = thread.title || 'Untitled Thread';
        const titleWords = title.toLowerCase().split(/\s+/);

        return {
          action: () => onNavigate(`/agent/${thread.id}`),
          category: 'navigation' as const,
          description: thread.lastMessage,
          icon: HiOutlineChatBubbleLeftRight,
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
      for (const commandId of previousCommands.keys()) {
        unregisterCommand(commandId);
      }

      previousCommandsRef.current = new Map();
      return;
    }

    const nextCommands = new Map(
      commands.map((command) => [command.id, command]),
    );

    for (const commandId of previousCommands.keys()) {
      if (!nextCommands.has(commandId)) {
        unregisterCommand(commandId);
      }
    }

    for (const [commandId, command] of nextCommands.entries()) {
      const previousCommand = previousCommands.get(commandId);

      if (!previousCommand) {
        registerCommand(command);
        continue;
      }

      if (
        previousCommand.label !== command.label ||
        previousCommand.description !== command.description ||
        previousCommand.keywords?.join('|') !== command.keywords?.join('|')
      ) {
        unregisterCommand(commandId);
        registerCommand(command);
      }
    }

    previousCommandsRef.current = nextCommands;
  }, [commands, enabled, registerCommand, unregisterCommand]);

  useEffect(() => {
    return () => {
      for (const commandId of previousCommandsRef.current.keys()) {
        unregisterCommand(commandId);
      }

      previousCommandsRef.current = new Map();
    };
  }, [unregisterCommand]);
}
