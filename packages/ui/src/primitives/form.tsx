import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';

/**
 * A form owns the vertical rhythm between its children. `Field` already owns
 * the spacing inside a field (label, control, help, error), so no field, label,
 * or `ModalActions` footer carries a margin of its own.
 *
 * - `default` — a stack of fields: modals, dialogs, auth screens.
 * - `section` — a page-level form whose children are sections, not fields.
 * - `none` — a form that is only a submit boundary around its own layout
 *   (prompt bars, inline toolbars, full-height panels).
 */
const formVariants = cva('', {
  defaultVariants: { spacing: 'default' },
  variants: {
    spacing: {
      default: 'flex flex-col gap-4',
      none: '',
      section: 'flex flex-col gap-6',
    },
  },
});

export type FormProps = ComponentPropsWithRef<'form'> &
  VariantProps<typeof formVariants>;

function Form({ ref, className, spacing, ...props }: FormProps) {
  return (
    <form
      ref={ref}
      className={cn(formVariants({ spacing }), className)}
      {...props}
    />
  );
}

/**
 * Paired fields that read as one decision (start and end, format and landing)
 * sit side by side and stack on narrow screens. The row owns the gap between
 * its fields; the parent `Form` or dialog body owns the gap between rows.
 */
const formRowVariants = cva('grid grid-cols-1 gap-4', {
  defaultVariants: { columns: 2 },
  variants: {
    columns: {
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-3',
    },
  },
});

export type FormRowProps = ComponentPropsWithRef<'div'> &
  VariantProps<typeof formRowVariants>;

function FormRow({ ref, className, columns, ...props }: FormRowProps) {
  return (
    <div
      ref={ref}
      className={cn(formRowVariants({ columns }), className)}
      {...props}
    />
  );
}

export { Form, FormRow };
