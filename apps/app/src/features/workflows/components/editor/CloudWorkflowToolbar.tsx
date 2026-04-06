'use client';

import { usePaneActions } from '@genfeedai/workflow-ui/hooks';
import {
  selectIsDirty,
  selectWorkflowName,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { SaveIndicator, Toolbar } from '@genfeedai/workflow-ui/toolbar';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CloudWorkflowToolbarProps {
  isSaving: boolean;
  leftContent?: ReactNode;
  logoHref?: string;
  logoSrc?: string;
  middleContent?: ReactNode;
  onRename?: (newName: string) => Promise<void> | void;
  rightContent?: ReactNode;
}

export function CloudWorkflowToolbar({
  isSaving,
  leftContent,
  logoHref = '/',
  logoSrc = 'https://cdn.genfeed.ai/assets/branding/logo-white.png',
  middleContent,
  onRename,
  rightContent,
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

  useEffect(() => {
    if (!isEditing) {
      setEditedName(workflowName || 'Untitled Workflow');
    }
  }, [isEditing, workflowName]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = useCallback(async () => {
    const trimmedName = editedName.trim();
    const nextName = trimmedName || 'Untitled Workflow';

    setIsEditing(false);

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
          <div className="flex min-w-0 items-center gap-3">
            {leftContent ? (
              <div className="cloud-workflow-toolbar-nav flex shrink-0 items-center">
                {leftContent}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editedName}
                  onBlur={() => void commitRename()}
                  onChange={(event) => setEditedName(event.target.value)}
                  onKeyDown={(event) => void handleNameKeyDown(event)}
                  className="cloud-workflow-title-input h-7 w-full rounded border border-border bg-secondary/70 px-2.5 text-sm font-medium text-foreground outline-none transition focus:border-primary/60 focus:bg-card focus:ring-1 focus:ring-primary/40"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="cloud-workflow-title block max-w-full truncate text-left text-sm font-medium text-foreground transition hover:text-white"
                  title="Rename workflow"
                >
                  {workflowName || 'Untitled Workflow'}
                </button>
              )}
            </div>
          </div>
        }
        logoHref={logoHref}
        logoSrc={logoSrc}
        middleContent={middleContent}
        onAutoLayout={autoLayout}
        rightContent={rightContent}
        saveIndicator={
          <SaveIndicator isDirty={isDirty} isSaving={isSaving} variant="pill" />
        }
        showShortcutHelp
      />
    </div>
  );
}
