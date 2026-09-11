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
import Field from '@genfeedai/ui/primitives/field';
import { Form } from '@genfeedai/ui/primitives/form';
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
        <Form onSubmit={handleSubmit}>
          <Field htmlFor="workflow-name" label="Workflow Name">
            <Input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="Enter workflow name"
              className="w-full"
            />
          </Field>

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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
