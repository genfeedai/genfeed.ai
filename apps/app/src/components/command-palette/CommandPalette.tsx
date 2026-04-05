'use client';

import { Kbd } from '@genfeedai/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';
import {
  CATEGORY_LABELS,
  COMMANDS,
  type Command,
  filterCommands,
  groupCommandsByCategory,
} from './commands';

interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

function CommandItem({ command, isSelected, onSelect, onMouseEnter }: CommandItemProps) {
  const Icon = command.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={`
        flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors
        ${isSelected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}
      `}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{command.label}</span>
      {command.shortcut && (
        <Kbd variant="muted" size="xs" className="ml-auto shrink-0 text-muted-foreground">
          {command.shortcut}
        </Kbd>
      )}
    </button>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    isOpen,
    searchQuery,
    selectedIndex,
    recentCommands,
    close,
    setQuery,
    setSelectedIndex,
    addRecentCommand,
  } = useCommandPaletteStore();

  const executeWorkflow = useExecutionStore((state) => state.executeWorkflow);
  const executeSelectedNodes = useExecutionStore((state) => state.executeSelectedNodes);
  const stopExecution = useExecutionStore((state) => state.stopExecution);
  const requestConfirmation = useRunWorkflowConfirmationStore((state) => state.requestConfirmation);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const { openModal, toggleAIGenerator } = useUIStore();
  const { addNode, exportWorkflow, selectedNodeIds } = useWorkflowStore();

  // Filter and group commands
  const filteredCommands = useMemo(() => filterCommands(COMMANDS, searchQuery), [searchQuery]);

  const groupedCommands = useMemo(
    () => groupCommandsByCategory(filteredCommands, searchQuery ? [] : recentCommands),
    [filteredCommands, recentCommands, searchQuery]
  );

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    const flat: Command[] = [];
    for (const commands of groupedCommands.values()) {
      flat.push(...commands);
    }
    return flat;
  }, [groupedCommands]);

  // Execute command
  const executeCommand = useCallback(
    (command: Command) => {
      addRecentCommand(command.id);
      close();

      switch (command.id) {
        case 'run-workflow':
          if (!isRunning) requestConfirmation(() => executeWorkflow());
          break;
        case 'run-selected':
          if (!isRunning && selectedNodeIds.length > 0) executeSelectedNodes();
          break;
        case 'stop-execution':
          if (isRunning) stopExecution();
          break;
        case 'save-workflow': {
          const workflow = exportWorkflow();
          const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${workflow.name.toLowerCase().replace(/\s+/g, '-')}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          break;
        }
        case 'open-settings':
          openModal('settings');
          break;
        case 'open-templates':
          openModal('templates');
          break;
        case 'toggle-ai-generator':
          toggleAIGenerator();
          break;
        case 'new-workflow':
          router.push('/workflows/new');
          break;
        default:
          // Handle node addition
          if (command.nodeType) {
            const position = { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 };
            addNode(command.nodeType, position);
          }
          break;
      }
    },
    [
      addRecentCommand,
      close,
      isRunning,
      executeWorkflow,
      requestConfirmation,
      selectedNodeIds.length,
      executeSelectedNodes,
      stopExecution,
      exportWorkflow,
      openModal,
      toggleAIGenerator,
      router,
      addNode,
    ]
  );

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(Math.min(selectedIndex + 1, flatCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(Math.max(selectedIndex - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatCommands[selectedIndex]) {
            executeCommand(flatCommands[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, flatCommands, close, setSelectedIndex, executeCommand]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current || flatCommands.length === 0) return;

    const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement && 'scrollIntoView' in selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatCommands.length]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Search input */}
        <div
          data-command-palette
          className="flex items-center gap-3 border-b border-border px-4 py-3"
        >
          <svg
            className="h-4 w-4 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Kbd variant="muted" size="xs" className="text-muted-foreground">
            ESC
          </Kbd>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {flatCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          ) : (
            Array.from(groupedCommands.entries()).map(([category, commands]) => {
              // Calculate starting index for this category
              let startIndex = 0;
              for (const [cat, cmds] of groupedCommands.entries()) {
                if (cat === category) break;
                startIndex += cmds.length;
              }

              return (
                <div key={category}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </div>
                  {commands.map((command, idx) => {
                    const globalIndex = startIndex + idx;
                    return (
                      <div key={command.id} data-index={globalIndex}>
                        <CommandItem
                          command={command}
                          isSelected={selectedIndex === globalIndex}
                          onSelect={() => executeCommand(command)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span>
            <Kbd variant="muted" size="xs" className="px-1">↑</Kbd>{' '}
            <Kbd variant="muted" size="xs" className="px-1">↓</Kbd> to navigate
          </span>
          <span>
            <Kbd variant="muted" size="xs" className="px-1">Enter</Kbd> to select
          </span>
        </div>
      </div>
    </div>
  );
}
