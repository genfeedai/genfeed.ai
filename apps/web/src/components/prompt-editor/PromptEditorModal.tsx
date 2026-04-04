'use client';

import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { usePromptEditorStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';

const FONT_SIZES = [12, 14, 16, 18, 20, 24];

function PromptEditorModalComponent() {
  const { isOpen, prompt, fontSize, closeEditor, setPrompt, setFontSize, saveAndClose } =
    usePromptEditorStore();
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
    [closeEditor, handleSave]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex flex-col w-full max-w-3xl max-h-[80vh] bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Edit Prompt</h2>
          <div className="flex items-center gap-3">
            <select
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              className="h-8 px-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt..."
            className="w-full h-full min-h-[300px] p-4 bg-[var(--background)] border border-[var(--border)] rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)] text-[var(--foreground)]"
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
