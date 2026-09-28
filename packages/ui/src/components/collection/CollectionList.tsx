import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionListProps } from '@genfeedai/props/ui/collection/collection.props';
import Card from '@ui/card/Card';

/**
 * One card holding a column of `ListRow`s. Rows draw their own dividers, so
 * the card body drops its padding and gap and only supplies plane and edge.
 */
export default function CollectionList({
  className,
  children,
  'data-testid': dataTestId,
}: CollectionListProps) {
  return (
    <Card
      bodyClassName="gap-0 p-0"
      className={cn('overflow-hidden', className)}
      data-testid={dataTestId}
    >
      {children}
    </Card>
  );
}
