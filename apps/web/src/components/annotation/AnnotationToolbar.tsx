'use client';

import { clsx } from 'clsx';
import { Redo, Trash2, Undo } from 'lucide-react';
import type { AnnotationTool } from '@genfeedai/workflow-ui/stores';
import { TOOLS } from './drawing/constants';

interface AnnotationToolbarProps {
  currentTool: AnnotationTool;
  selectedShapeId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onToolSelect: (tool: AnnotationTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
}

/**
 * Toolbar for annotation tools (select, shapes, undo/redo)
 */
export function AnnotationToolbar({
  currentTool,
  selectedShapeId,
  canUndo,
  canRedo,
  onToolSelect,
  onUndo,
  onRedo,
  onDelete,
}: AnnotationToolbarProps) {
  return (
    <div className="flex w-14 flex-col gap-1 border-r border-border bg-card p-2">
      {/* Tool buttons */}
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <button
          key={tool}
          onClick={() => onToolSelect(tool)}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg transition',
            currentTool === tool
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
          title={label}
        >
          <Icon className="h-5 w-5" />
        </button>
      ))}

      <div className="my-2 h-px bg-border" />

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-5 w-5" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo className="h-5 w-5" />
      </button>

      {/* Delete selected */}
      {selectedShapeId && (
        <>
          <div className="my-2 h-px bg-border" />
          <button
            onClick={onDelete}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10"
            title="Delete selected (Del)"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
