'use client';

import { usePromptEditorStore } from '@genfeedai/workflow-ui/stores';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/store/workflowStore';

const FONT_SIZES = [12, 14, 16, 18, 20, 24];

function PromptEditorModalComponent() {
  const {
    isOpen,
    prompt,
    fontSize,
    closeEditor,
    setPrompt,
    setFontSize,
    saveAndClose,
  } = usePromptEditorStore();
  const { updateNodeData } = useWorkflowStore();

  const handleSave = useCallback(() => {
    const result = saveAndClose();
    if (result) {
      updateNodeData(result.nodeId, { prompt: result.prompt });
    }
  }, [saveAndClose, updateNodeData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeEditor();
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSave();
      }
    },
    [closeEditor, handleSave],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Edit Prompt
          </h2>
          <div className="flex items-center gap-3">
            <Select
              value={String(fontSize)}
              onValueChange={(val) => setFontSize(parseInt(val, 10))}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue placeholder="Font size" />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-hidden">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt..."
            className="w-full h-full min-h-[300px] resize-none"
            style={{ fontSize: `${fontSize}px` }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-[var(--border)]">
          <Button variant="outline" onClick={closeEditor}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Submit</Button>
        </div>
      </div>
    </div>
  );
}

export const PromptEditorModal = memo(PromptEditorModalComponent);
