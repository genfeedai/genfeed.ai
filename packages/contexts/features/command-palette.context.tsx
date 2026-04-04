'use client';

import type {
  ICommand,
  ICommandPaletteContext,
  ICommandPaletteProviderProps,
  ICommandPaletteState,
} from '@genfeedai/interfaces/ui/command-palette.interface';
import { CommandPaletteService } from '@services/core/command-palette.service';
import { logger } from '@services/core/logger.service';
import {
  createContext,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';

export const CommandPaletteContext =
  createContext<ICommandPaletteContext | null>(null);

export function CommandPaletteProvider({
  children,
}: ICommandPaletteProviderProps): ReactElement {
  const [state, setState] = useState<ICommandPaletteState>(() => ({
    commands: CommandPaletteService.getAllCommands(),
    filteredCommands: CommandPaletteService.getAllCommands(),
    isOpen: false,
    query: '',
    recentCommands: CommandPaletteService.getRecentCommands(),
    selectedIndex: 0,
  }));

  const getClosedState = useCallback(
    (): Partial<ICommandPaletteState> => ({
      isOpen: false,
      query: '',
      selectedIndex: 0,
    }),
    [],
  );

  const toggle = useCallback(() => {
    setState((prev) => {
      if (prev.isOpen) {
        logger.info('Command palette closed');
        return { ...prev, ...getClosedState() };
      }
      logger.info('Command palette opened');
      return {
        ...prev,
        filteredCommands: CommandPaletteService.getAllCommands(),
        isOpen: true,
        query: '',
        selectedIndex: 0,
      };
    });
  }, [getClosedState]);

  const selectNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex:
        prev.selectedIndex < prev.filteredCommands.length - 1
          ? prev.selectedIndex + 1
          : 0,
    }));
  }, []);

  const selectPrevious = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex:
        prev.selectedIndex > 0
          ? prev.selectedIndex - 1
          : prev.filteredCommands.length - 1,
    }));
  }, []);

  const executeCommand = useCallback(
    async (commandId: string) => {
      try {
        await CommandPaletteService.executeCommand(commandId);
        const recentCommands = CommandPaletteService.getRecentCommands();
        setState((prev) => ({
          ...prev,
          ...getClosedState(),
          recentCommands,
        }));
      } catch (error) {
        logger.error('Failed to execute command', { commandId, error });
      }
    },
    [getClosedState],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        toggle();
      }

      if (event.key === 'Escape' && state.isOpen) {
        setState((prev) => ({ ...prev, ...getClosedState() }));
        logger.info('Command palette closed');
      }

      if (state.isOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          selectNext();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          selectPrevious();
        } else if (event.key === 'Enter' && state.filteredCommands.length > 0) {
          event.preventDefault();
          const selectedCommand = state.filteredCommands[state.selectedIndex];
          if (selectedCommand) {
            executeCommand(selectedCommand.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    state.isOpen,
    state.selectedIndex,
    state.filteredCommands,
    toggle,
    selectNext,
    selectPrevious,
    executeCommand,
    getClosedState,
  ]);

  const open = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filteredCommands: CommandPaletteService.getAllCommands(),
      isOpen: true,
      query: '',
      selectedIndex: 0,
    }));
    logger.info('Command palette opened');
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, ...getClosedState() }));
    logger.info('Command palette closed');
  }, [getClosedState]);

  const setQuery = useCallback((query: string) => {
    const filteredCommands = CommandPaletteService.searchCommands(query);
    setState((prev) => ({
      ...prev,
      filteredCommands,
      query,
      selectedIndex: 0,
    }));
  }, []);

  const registerCommand = useCallback((command: ICommand) => {
    CommandPaletteService.registerCommand(command);
    const commands = CommandPaletteService.getAllCommands();
    setState((prev) => ({
      ...prev,
      commands,
    }));
  }, []);

  const unregisterCommand = useCallback((commandId: string) => {
    CommandPaletteService.unregisterCommand(commandId);
    const commands = CommandPaletteService.getAllCommands();
    setState((prev) => ({
      ...prev,
      commands,
    }));
  }, []);

  const registerCommands = useCallback((commands: ICommand[]) => {
    CommandPaletteService.registerCommands(commands);
    const allCommands = CommandPaletteService.getAllCommands();
    setState((prev) => ({
      ...prev,
      commands: allCommands,
    }));
  }, []);

  const value: ICommandPaletteContext = {
    close,
    executeCommand,
    open,
    registerCommand,
    registerCommands,
    selectNext,
    selectPrevious,
    setQuery,
    state,
    toggle,
    unregisterCommand,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}
