'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { usePaneActions } from '@genfeedai/workflows/ui/hooks';
import {
  selectIsDirty,
  selectWorkflowName,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import { SaveIndicator, Toolbar } from '@genfeedai/workflows/ui/toolbar';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

interface CloudWorkflowToolbarProps {
  isSaving: boolean;
  middleContent?: ReactNode;
  onRename?: (newName: string) => Promise<void> | void;
}

export function CloudWorkflowToolbar({
  isSaving,
  middleContent,
  onRename,
}: CloudWorkflowToolbarProps) {
  const isDirty = useWorkflowStore(selectIsDirty);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const workflowName = useWorkflowStore(selectWorkflowName);
  const { autoLayout } = usePaneActions();
  const [editedName, setEditedName] = useState(
    workflowName || 'Untitled Workflow',
  );
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = useCallback(async () => {
    const trimmedName = editedName.trim();
    const nextName = trimmedName || 'Untitled Workflow';

    setIsEditing(false);
    setEditedName(workflowName || 'Untitled Workflow');

    if (nextName === workflowName) {
      return;
    }

    setWorkflowName(nextName);
    await onRename?.(nextName);
  }, [editedName, onRename, setWorkflowName, workflowName]);

  const handleNameKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await commitRename();
      }

      if (event.key === 'Escape') {
        setEditedName(workflowName || 'Untitled Workflow');
        setIsEditing(false);
      }
    },
    [commitRename, workflowName],
  );

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
    // Focus and select after state update, so the input is rendered
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, []);

  return (
    <div className="workflow-topbar-shell">
      <Toolbar
        onSaveAs={async (newName) => {
          const trimmedName = newName.trim();
          const nextName = trimmedName || 'Untitled Workflow';

          setWorkflowName(nextName);
          await onRename?.(nextName);
        }}
        leftContent={
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <Input
                ref={inputRef}
                type="text"
                value={editedName}
                onBlur={() => void commitRename()}
                onChange={(event) => setEditedName(event.target.value)}
                onKeyDown={(event) => void handleNameKeyDown(event)}
                className="cloud-workflow-title-input h-7 w-full rounded border-border bg-secondary/70 px-2.5 text-sm font-medium text-foreground transition focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            ) : (
              <Button
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={handleStartEditing}
                className="cloud-workflow-title block max-w-full truncate text-left text-sm font-medium text-foreground transition hover:text-foreground/80"
                tooltip="Rename workflow"
              >
                {workflowName || 'Untitled Workflow'}
              </Button>
            )}
          </div>
        }
        middleContent={middleContent}
        onAutoLayout={autoLayout}
        saveIndicator={
          <SaveIndicator isDirty={isDirty} isSaving={isSaving} variant="pill" />
        }
        showShortcutHelp
      />
    </div>
  );
}
