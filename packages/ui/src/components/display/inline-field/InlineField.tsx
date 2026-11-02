'use client';

import { cn } from '@genfeedai/helpers';
import type {
  InlineFieldProps,
  InlineNumberFieldEditor,
  InlineSwitchFieldEditor,
} from '@genfeedai/props/ui/display/inline-field.props';
import { useInlineSave } from '@ui/display/inline-field/use-inline-save';
import { EditableText } from '@ui/primitives/editable-text';
import { Skeleton } from '@ui/primitives/skeleton';
import { Switch } from '@ui/primitives/switch';
import dynamic from 'next/dynamic';

// Select, multi-select and color editors load on first use (see the file).
const InlineFieldPicker = dynamic(
  () => import('@ui/display/inline-field/InlineFieldPicker'),
  { loading: () => <Skeleton className="h-8 w-full" />, ssr: false },
);

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
      {editor.kind === 'select' ||
      editor.kind === 'multiselect' ||
      editor.kind === 'color' ? (
        <InlineFieldPicker editor={editor} />
      ) : null}
      {editor.kind === 'switch' ? <InlineSwitchField editor={editor} /> : null}
    </div>
  );
}
