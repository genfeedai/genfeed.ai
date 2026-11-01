import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import {
  tableCellVariants,
  tableHeadVariants,
  tableVariants,
} from './table.variants';

function Table({
  ref,
  className,
  isStriped,
  size,
  ...props
}: HTMLAttributes<HTMLTableElement> &
  VariantProps<typeof tableVariants> & { ref?: React.Ref<HTMLTableElement> }) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn(tableVariants({ isStriped, size }), className)}
        {...props}
      />
    </div>
  );
}
Table.displayName = 'Table';

function TableHeader({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <thead
      ref={ref}
      className={cn('[&_tr]:border-b [&_tr]:border-border', className)}
      {...props}
    />
  );
}
TableHeader.displayName = 'TableHeader';

function TableBody({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <tbody
      ref={ref}
      className={cn(
        'divide-y divide-border [&_tr:last-child]:border-0',
        className,
      )}
      {...props}
    />
  );
}
TableBody.displayName = 'TableBody';

function TableFooter({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        'border-t border-border bg-tertiary/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}
TableFooter.displayName = 'TableFooter';

function TableRow({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  ref?: React.Ref<HTMLTableRowElement>;
}) {
  return (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border transition-colors hover:bg-tertiary/50 data-[state=selected]:bg-tertiary/60',
        className,
      )}
      {...props}
    />
  );
}
TableRow.displayName = 'TableRow';

function TableHead({
  ref,
  align,
  className,
  isSortable,
  tone,
  variant,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> &
  VariantProps<typeof tableHeadVariants> & {
    ref?: React.Ref<HTMLTableCellElement>;
  }) {
  return (
    <th
      ref={ref}
      className={cn(
        tableHeadVariants({ align, isSortable, tone, variant }),
        className,
      )}
      {...props}
    />
  );
}
TableHead.displayName = 'TableHead';

function TableCell({
  ref,
  align,
  className,
  tone,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> &
  VariantProps<typeof tableCellVariants> & {
    ref?: React.Ref<HTMLTableCellElement>;
  }) {
  return (
    <td
      ref={ref}
      className={cn(tableCellVariants({ align, tone }), className)}
      {...props}
    />
  );
}
TableCell.displayName = 'TableCell';

function TableCaption({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableCaptionElement> & {
  ref?: React.Ref<HTMLTableCaptionElement>;
}) {
  return (
    <caption
      ref={ref}
      className={cn('mt-4 text-2xs text-muted-foreground', className)}
      {...props}
    />
  );
}
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
