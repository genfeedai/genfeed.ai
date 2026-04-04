import type { ComponentType, ReactNode } from 'react';

export interface ICommand {
  id: string;
  label: string;
  description?: string;
  icon?: string | ComponentType<{ className?: string }>;
  shortcut?: string[];
  keywords?: string[];
  category: CommandCategory;
  action: () => void | Promise<void>;
  condition?: () => boolean;
  priority?: number;
}

export type CommandCategory =
  | 'actions'
  | 'administration'
  | 'automation'
  | 'configuration'
  | 'content'
  | 'crm'
  | 'darkroom'
  | 'generation'
  | 'help'
  | 'navigation'
  | 'recent'
  | 'search'
  | 'settings';

export interface ICommandGroup {
  category: CommandCategory;
  label: string;
  commands: ICommand[];
}

export interface ICommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  commands: ICommand[];
  filteredCommands: ICommand[];
  recentCommands: string[];
}

export interface ICommandPaletteContext {
  state: ICommandPaletteState;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  executeCommand: (commandId: string) => void;
  registerCommand: (command: ICommand) => void;
  unregisterCommand: (commandId: string) => void;
  registerCommands: (commands: ICommand[]) => void;
  selectNext: () => void;
  selectPrevious: () => void;
}

export interface ICommandPaletteProviderProps {
  children: ReactNode;
}

export interface ICommandPaletteProps {
  maxResults?: number;
  placeholder?: string;
  noResultsMessage?: string;
  className?: string;
}

export interface ICommandPaletteItemProps {
  command: ICommand;
  isSelected: boolean;
  onClick: () => void;
}
