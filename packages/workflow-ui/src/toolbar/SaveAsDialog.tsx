'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SaveAsDialogProps {
  isOpen: boolean;
  currentName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

export function SaveAsDialog({
  isOpen,
  currentName,
  onSave,
  onClose,
}: SaveAsDialogProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(`${currentName} (copy)`);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, currentName]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed) {
        onSave(trimmed);
      }
    },
    [name, onSave],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Save As</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="workflow-name"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Workflow Name
            </label>
            <input
              ref={inputRef}
              id="workflow-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter workflow name"
              autoFocus
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
