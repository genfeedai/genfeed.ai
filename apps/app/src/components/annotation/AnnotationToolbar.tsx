'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { AnnotationTool } from '@genfeedai/workflow-ui/stores';
import Button from '@ui/buttons/base/Button';
import { clsx } from 'clsx';
import { Redo, Trash2, Undo } from 'lucide-react';
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
        <Button
          key={tool}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={() => onToolSelect(tool)}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg transition',
            currentTool === tool
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
          tooltip={label}
          icon={<Icon className="h-5 w-5" />}
        />
      ))}

      <div className="my-2 h-px bg-border" />

      {/* Undo/Redo */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onUndo}
        isDisabled={!canUndo}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
        tooltip="Undo (Ctrl+Z)"
        icon={<Undo className="h-5 w-5" />}
      />
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onRedo}
        isDisabled={!canRedo}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
        tooltip="Redo (Ctrl+Shift+Z)"
        icon={<Redo className="h-5 w-5" />}
      />

      {/* Delete selected */}
      {selectedShapeId && (
        <>
          <div className="my-2 h-px bg-border" />
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onDelete}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10"
            tooltip="Delete selected (Del)"
            icon={<Trash2 className="h-5 w-5" />}
          />
        </>
      )}
    </div>
  );
}
