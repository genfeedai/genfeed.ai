'use client';

import { ChevronDown, Loader2, Plus, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkflowData } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useWorkflowStore } from '@/store/workflowStore';

interface WorkflowSwitcherProps {
  className?: string;
}

function WorkflowSwitcherComponent({ className }: WorkflowSwitcherProps) {
  const router = useRouter();

  const { workflowName, workflowId, isDirty, setWorkflowName, saveWorkflow, listWorkflows } =
    useWorkflowStore();

  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ left: 0, top: 0 });
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(workflowName);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync editedName when workflowName changes externally
  useEffect(() => {
    if (!isEditing) setEditedName(workflowName);
  }, [workflowName, isEditing]);

  // Focus and select input when entering edit mode
  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        left: rect.left,
        top: rect.bottom + 4,
      });
    }
  }, [isOpen]);

  // Load workflows when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setIsLoading(true);

    listWorkflows(controller.signal)
      .then((data) => {
        setWorkflows(data);
        setIsLoading(false);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          logger.error('Failed to load workflows', error, { context: 'WorkflowSwitcher' });
        }
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, listWorkflows]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNameSave = useCallback(async () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== workflowName) {
      setWorkflowName(trimmed);
      await saveWorkflow();
    }
    setIsEditing(false);
  }, [editedName, workflowName, setWorkflowName, saveWorkflow]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleNameSave();
      if (e.key === 'Escape') {
        setEditedName(workflowName);
        setIsEditing(false);
      }
    },
    [handleNameSave, workflowName]
  );

  const handleWorkflowSelect = useCallback(
    async (selectedWorkflow: WorkflowData) => {
      if (selectedWorkflow._id === workflowId) {
        setIsOpen(false);
        return;
      }

      setIsSwitching(true);
      setIsOpen(false);

      try {
        // Save current workflow if dirty
        if (isDirty) {
          await saveWorkflow();
        }

        // Navigate to selected workflow
        router.push(`/workflows/${selectedWorkflow._id}`);
      } catch (error) {
        logger.error('Failed to switch workflow', error, { context: 'WorkflowSwitcher' });
        setIsSwitching(false);
      }
    },
    [workflowId, isDirty, saveWorkflow, router]
  );

  const handleNewWorkflow = useCallback(async () => {
    setIsSwitching(true);
    setIsOpen(false);

    try {
      // Save current workflow if dirty
      if (isDirty) {
        await saveWorkflow();
      }

      router.push('/workflows/new');
    } catch (error) {
      logger.error('Failed to create new workflow', error, { context: 'WorkflowSwitcher' });
      setIsSwitching(false);
    }
  }, [isDirty, saveWorkflow, router]);

  // Filter out current workflow from list (memoized to avoid re-computation on each render)
  const otherWorkflows = useMemo(
    () => workflows.filter((w) => w._id !== workflowId),
    [workflows, workflowId]
  );

  return (
    <>
      <div ref={triggerRef} className={className}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleNameKeyDown}
            className="text-sm font-semibold bg-transparent border-b border-primary outline-none text-foreground w-full"
          />
        ) : (
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={isSwitching}
            className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary transition-colors group"
          >
            {isSwitching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span
              className="cursor-text"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {workflowName}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[100] w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            style={{ left: dropdownPosition.left, top: dropdownPosition.top }}
          >
            {/* Header */}
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Switch Workflow
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-auto">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : otherWorkflows.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No other workflows
                </div>
              ) : (
                <div className="py-1">
                  {otherWorkflows.map((workflow) => (
                    <button
                      key={workflow._id}
                      onClick={() => handleWorkflowSelect(workflow)}
                      className="w-full px-3 py-2 text-left transition hover:bg-secondary"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary">
                          <Workflow className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{workflow.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(workflow.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New Workflow Footer */}
            <div className="border-t border-border">
              <button
                onClick={handleNewWorkflow}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>New Workflow</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export const WorkflowSwitcher = memo(WorkflowSwitcherComponent);
