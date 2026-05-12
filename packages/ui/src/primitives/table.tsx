import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

function Table({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn('ship-ui w-full caption-bottom text-sm', className)}
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
      className={cn('ship-ui [&_tr]:border-b [&_tr]:border-border', className)}
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
        'ship-ui divide-y divide-border [&_tr:last-child]:border-0',
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
        'ship-ui border-t border-border bg-tertiary/50 font-medium [&>tr]:last:border-b-0',
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
        'ship-ui border-b border-border transition-colors hover:bg-tertiary/50 data-[state=selected]:bg-tertiary/60',
        className,
      )}
      {...props}
    />
  );
}
TableRow.displayName = 'TableRow';

function TableHead({
  ref,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
}) {
  return (
    <th
      ref={ref}
      className={cn(
        'ship-ui h-9 px-2 text-left align-middle text-[11px] font-medium uppercase tracking-wide text-muted [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}
TableHead.displayName = 'TableHead';

function TableCell({
  ref,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
}) {
  return (
    <td
      ref={ref}
      className={cn(
        'ship-ui px-2 py-2 align-middle text-[12px] text-primary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
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
      className={cn('ship-ui mt-4 text-[11px] text-muted', className)}
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
