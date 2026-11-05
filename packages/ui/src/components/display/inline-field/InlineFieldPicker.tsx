'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  InlineColorFieldEditor,
  InlineMultiSelectFieldEditor,
  InlineSelectFieldEditor,
} from '@genfeedai/props/ui/display/inline-field.props';
import { useInlineSave } from '@ui/display/inline-field/use-inline-save';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { ColorInput } from '@ui/primitives/color-input';
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
import { useState } from 'react';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

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
  return value && HEX_COLOR_PATTERN.test(value) ? value : '#000000';
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

/**
 * The select, multi-select and color editors. They pull in Radix Select and
 * Popover, a checkbox and the color input, so `InlineField` loads this file on
 * demand: a list row that only edits text never pays for them.
 */
export default function InlineFieldPicker({
  editor,
}: {
  editor:
    | InlineColorFieldEditor
    | InlineMultiSelectFieldEditor
    | InlineSelectFieldEditor;
}) {
  if (editor.kind === 'select') {
    return <InlineSelectField editor={editor} />;
  }
  if (editor.kind === 'multiselect') {
    return <InlineMultiSelectField editor={editor} />;
  }
  return <InlineColorField editor={editor} />;
}
