'use client';

import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';
import { useCommandPaletteDialog } from '@genfeedai/hooks/ui/use-command-palette-dialog/use-command-palette-dialog';
import type { ICommandPaletteProps } from '@genfeedai/interfaces/ui/command-palette.interface';
import { CommandPaletteView } from '@ui/command-palette/command-palette/CommandPaletteView';
import { type ReactElement, useCallback, useRef } from 'react';

const MODAL_ID = 'command-palette-modal';

export function CommandPalette({
  maxResults = 10,
  placeholder = 'Type a command or search...',
  noResultsMessage = 'No commands found',
  className,
}: ICommandPaletteProps): ReactElement {
  const { state, close, setQuery, executeCommand } = useCommandPalette();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = state.filteredCommands;
  const totalCount = commands.length;

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useCommandPaletteDialog({
    isOpen: state.isOpen,
    modalId: MODAL_ID,
    onAfterOpen: focusInput,
  });

  return (
    <CommandPaletteView
      id={MODAL_ID}
      commands={commands}
      totalCount={totalCount}
      selectedIndex={state.selectedIndex}
      query={state.query}
      inputRef={inputRef}
      maxResults={maxResults}
      placeholder={placeholder}
      noResultsMessage={noResultsMessage}
      className={className}
      onClose={close}
      onQueryChange={setQuery}
      onSelectCommand={executeCommand}
    />
  );
}
