import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal } from '../modals/compound/Modal';
import { type ContentType, ContentTypePresets } from './ContentTypePresets';

interface TaskComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    prompt: string;
    contentType: ContentType;
  }) => void | Promise<void>;
  isSubmitting?: boolean;
  contentTypes?: ContentType[];
  /** Additional fields rendered between content type and prompt (e.g., brand targeting) */
  children?: ReactNode;
}

export function TaskComposerModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  contentTypes = ['image', 'video', 'text'],
  children,
}: TaskComposerModalProps) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [contentType, setContentType] = useState<ContentType>('image');

  function reset() {
    setTitle('');
    setPrompt('');
    setContentType('image');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    await onSubmit({ contentType, prompt: prompt.trim(), title: title.trim() });
    reset();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Modal.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Modal.Content size="lg" aria-describedby="task-composer-desc">
        <Modal.Header>
          <Modal.Title>Start a task</Modal.Title>
          <Modal.Description id="task-composer-desc">
            Describe the outcome you want. Genfeed routes it automatically.
          </Modal.Description>
        </Modal.Header>

        <Modal.Body>
          <div className="space-y-4">
            {/* Title */}
            <input
              className="w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Task title..."
              value={title}
            />

            {/* Content type presets */}
            <ContentTypePresets
              onChange={setContentType}
              selected={contentType}
              types={contentTypes}
            />

            {/* App-specific fields (brand targeting, etc.) */}
            {children}

            {/* Prompt */}
            <textarea
              className="min-h-32 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what to generate..."
              rows={5}
              value={prompt}
            />
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Modal.CloseButton asChild>
            <button
              type="button"
              className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </Modal.CloseButton>
          <button
            type="button"
            className="border border-foreground/20 bg-foreground/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/20 disabled:opacity-50"
            disabled={isSubmitting || !title.trim()}
            onClick={handleSubmit}
          >
            {isSubmitting
              ? 'Creating...'
              : prompt.trim()
                ? 'Create & Generate'
                : 'Create Task'}
            {!isSubmitting && (
              <span className="ml-2 text-xs text-muted-foreground">⌘↵</span>
            )}
          </button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
