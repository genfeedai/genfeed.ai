'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type {
  InlineColorFieldEditor,
  InlineFieldProps,
  InlineMultiSelectFieldEditor,
  InlineNumberFieldEditor,
  InlineSelectFieldEditor,
  InlineSwitchFieldEditor,
} from '@genfeedai/props/ui/display/inline-field.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { ColorInput } from '@ui/primitives/color-input';
import { EditableText } from '@ui/primitives/editable-text';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { useState } from 'react';

/** Runs a save and keeps the control disabled until it settles. */
function useInlineSave() {
  const [isSaving, setIsSaving] = useState(false);

  const save = async (run: () => Promise<void> | void) => {
    setIsSaving(true);
    try {
      await run();
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, save };
}

function InlineNumberField({ editor }: { editor: InlineNumberFieldEditor }) {
  const min = editor.min ?? 0;

  return (
    <EditableText
      ariaLabel={editor.ariaLabel}
      displayClassName="text-sm"
      isDisabled={editor.isDisabled}
      isRequired
      maxLength={9}
      onSave={(value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error('Not a number');
        }
        return editor.onSave(Math.max(min, parsed));
      }}
      value={String(editor.value ?? min)}
    />
  );
}

function InlineSelectField({ editor }: { editor: InlineSelectFieldEditor }) {
  const { isSaving, save } = useInlineSave();

  return (
    <Select
      disabled={editor.isDisabled || isSaving}
      onValueChange={(value) => {
        if (value !== (editor.value ?? '')) {
          void save(() => editor.onSave(value));
        }
      }}
      value={editor.value ?? ''}
    >
      <SelectTrigger aria-label={editor.ariaLabel} className="h-8 w-full">
        <SelectValue placeholder={editor.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {editor.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineMultiSelectField({
  editor,
}: {
  editor: InlineMultiSelectFieldEditor;
}) {
  const { isSaving, save } = useInlineSave();
  const [draft, setDraft] = useState<string[] | null>(null);
  const saved = editor.values ?? [];
  const current = draft ?? saved;

  const commit = () => {
    const next = draft;
    setDraft(null);
    if (
      next !== null &&
      (next.length !== saved.length || next.some((v) => !saved.includes(v)))
    ) {
      void save(() => editor.onSave(next));
    }
  };

  const toggle = (value: string, isChecked: boolean) =>
    setDraft(
      isChecked
        ? [...current, value]
        : current.filter((candidate) => candidate !== value),
    );

  const summary = current
    .map((value) => editor.options.find((o) => o.value === value)?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <Popover
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          commit();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ariaLabel={editor.ariaLabel}
          className="h-8 w-full justify-start text-left"
          isDisabled={editor.isDisabled || isSaving}
          label={summary || editor.placeholder || '-'}
          variant={ButtonVariant.SECONDARY}
        />
      </PopoverTrigger>
      <PopoverContent className="max-h-64 w-64 space-y-2 overflow-y-auto p-3">
        {editor.options.map((option) => (
          <Checkbox
            isChecked={current.includes(option.value)}
            key={option.value}
            label={option.label}
            name={`${editor.ariaLabel}-${option.value}`}
            onChange={(event) => toggle(option.value, event.target.checked)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A native color input only takes `#rrggbb`; anything else shows black. */
function toColorValue(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}

function InlineColorField({ editor }: { editor: InlineColorFieldEditor }) {
  const { isSaving, save } = useInlineSave();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const next = draft;
    setDraft(null);
    if (next !== null && next !== toColorValue(editor.value)) {
      void save(() => editor.onSave(next));
    }
  };

  return (
    <ColorInput
      aria-label={editor.ariaLabel}
      disabled={editor.isDisabled || isSaving}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      value={draft ?? toColorValue(editor.value)}
    />
  );
}

function InlineSwitchField({ editor }: { editor: InlineSwitchFieldEditor }) {
  const { isSaving, save } = useInlineSave();

  return (
    <Switch
      aria-label={editor.ariaLabel}
      isChecked={editor.isChecked}
      isDisabled={editor.isDisabled || isSaving}
      onCheckedChange={(isChecked) => void save(() => editor.onSave(isChecked))}
    />
  );
}

/**
 * One field of a record edited in place (context sidebar facts): text,
 * number, select, color or switch. The single shared replacement for
 * "Edit" buttons that open a form modal — brand detail's `EditableText`
 * is its text variant.
 */
export default function InlineField({ className, editor }: InlineFieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {editor.kind === 'text' ? (
        <EditableText
          ariaLabel={editor.ariaLabel}
          displayClassName="text-sm"
          isDisabled={editor.isDisabled}
          isMultiline={editor.isMultiline}
          isRequired={editor.isRequired}
          maxLength={editor.maxLength}
          onSave={editor.onSave}
          placeholder={editor.placeholder}
          value={editor.value ?? ''}
        />
      ) : null}
      {editor.kind === 'number' ? <InlineNumberField editor={editor} /> : null}
      {editor.kind === 'select' ? <InlineSelectField editor={editor} /> : null}
      {editor.kind === 'multiselect' ? (
        <InlineMultiSelectField editor={editor} />
      ) : null}
      {editor.kind === 'color' ? <InlineColorField editor={editor} /> : null}
      {editor.kind === 'switch' ? <InlineSwitchField editor={editor} /> : null}
    </div>
  );
}
