'use client';

import { ButtonVariant } from '@genfeedai/contracts';

import { Input } from '@genfeedai/ui';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@genfeedai/ui/primitives/dialog';
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
      const timer = window.setTimeout(() => inputRef.current?.select(), 0);
      return () => window.clearTimeout(timer);
    }

    return undefined;
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

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>Save As</DialogTitle>
        </DialogHeader>
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
              className="w-full"
            />
          </div>

          <DialogFooter>
            <Button
              withWrapper={false}
              type="button"
              variant={ButtonVariant.SECONDARY}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              withWrapper={false}
              type="submit"
              variant={ButtonVariant.DEFAULT}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
