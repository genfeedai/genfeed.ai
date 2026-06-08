'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { Button } from '@ui/primitives/button';

interface WorkspaceTaskBrandFieldProps {
  editor: Editor | null;
  onClear: () => void;
  selectedTargetBrandLabel: string;
  taskTargetBrandId: string | null;
}

export function WorkspaceTaskBrandField({
  editor,
  onClear,
  selectedTargetBrandLabel,
  taskTargetBrandId,
}: WorkspaceTaskBrandFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="block text-xs font-medium text-foreground/60">
          Target brand
        </span>
        {taskTargetBrandId ? (
          <Button
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            className="px-2 text-xs text-foreground/55"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/35">
          Type @ to target a brand.
        </div>
      )}
      <p className="text-xs text-foreground/35">
        Targeting{' '}
        <span className="font-medium text-foreground/55">
          {selectedTargetBrandLabel}
        </span>
        {taskTargetBrandId ? ' from this modal' : ' by default'}.
      </p>
    </div>
  );
}
