import type { RowSidebarSectionProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';

/** Titled group of detail in a row's right sidebar. */
export default function RowSidebarSection({
  children,
  title,
}: RowSidebarSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
