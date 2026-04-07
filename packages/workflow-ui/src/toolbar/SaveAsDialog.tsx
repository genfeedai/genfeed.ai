'use client';

import { Input } from '@genfeedai/ui';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';

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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <div
        role="dialog"
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Save As</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="workflow-name"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Workflow Name
            </label>
            <Input
              ref={inputRef}
              id="workflow-name"
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="Enter workflow name"
              autoFocus
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
