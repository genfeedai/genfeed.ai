'use client';

import type {
  ICommand,
  ICommandPaletteProps,
} from '@genfeedai/interfaces/ui/command-palette.interface';
import { Kbd } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { CommandPaletteItem } from '@ui/command-palette/command-palette-item/CommandPaletteItem';
import Modal from '@ui/modals/modal/Modal';
import { Input } from '@ui/primitives/input';
import type { ReactElement, RefObject } from 'react';

export interface CommandPaletteViewProps extends ICommandPaletteProps {
  id: string;
  commands: ICommand[];
  totalCount: number;
  selectedIndex: number;
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectCommand: (commandId: string) => void;
}

export function CommandPaletteView({
  id,
  commands,
  totalCount,
  selectedIndex,
  query,
  maxResults = 10,
  placeholder = 'Type a command or search...',
  noResultsMessage = 'No commands found',
  className,
  inputRef,
  onClose,
  onQueryChange,
  onSelectCommand,
}: CommandPaletteViewProps): ReactElement {
  const displayedCommands = commands.slice(0, maxResults);

  return (
    <Modal
      id={id}
      onClose={onClose}
      showCloseButton={false}
      modalBoxClassName="max-w-2xl max-h-[calc(100vh-10rem)] p-0"
    >
      <div className={cn('flex h-full flex-col', className)}>
        <div className="flex-shrink-0 border-b border-white/[0.08] p-4">
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            className="h-12 text-lg"
          />
        </div>

        <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto">
          {displayedCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-foreground/60">
              {noResultsMessage}
            </div>
          ) : (
            <div>
              {!query && displayedCommands.length > 0 && (
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">
                  Commands
                </div>
              )}

              {displayedCommands.map((command, index) => (
                <CommandPaletteItem
                  key={command.id}
                  command={command}
                  isSelected={index === selectedIndex}
                  onClick={() => onSelectCommand(command.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between border-t border-white/[0.08] px-4 py-2 text-xs text-foreground/60">
          <div className="flex gap-4">
            <span>
              <Kbd>↑↓</Kbd> Navigate
            </span>
            <span>
              <Kbd>↵</Kbd> Execute
            </span>
            <span>
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
          <span>
            {displayedCommands.length} of {totalCount} commands
          </span>
        </div>
      </div>
    </Modal>
  );
}
