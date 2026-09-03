import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ListRowProps } from '@genfeedai/props/ui/lists/list-row.props';
import { Button as BaseButton } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactElement } from 'react';

const DENSITY_CLASSES: Record<'compact' | 'comfortable', string> = {
  comfortable: 'p-4',
  compact: 'px-4 py-3',
};

const BASE_CLASSES =
  'w-full border-b border-border text-left transition-colors duration-150 last:border-b-0';

function ListRowContent({
  description,
  leading,
  meta,
  title,
  trailing,
}: Pick<
  ListRowProps,
  'description' | 'leading' | 'meta' | 'title' | 'trailing'
>) {
  return (
    <div className="flex items-start gap-3">
      {leading}

      <div className="min-w-0 flex-1">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </p>
        {description ? (
          <p className="mt-1 line-clamp-2 text-sm text-foreground/55">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-1 text-xs text-foreground/40">{meta}</div>
        ) : null}
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function ListRow(props: ListRowProps): ReactElement {
  const {
    className,
    density = 'comfortable',
    description,
    leading,
    meta,
    title,
    trailing,
    'data-testid': dataTestId,
  } = props;

  const rowClassName = cn(
    BASE_CLASSES,
    DENSITY_CLASSES[density],
    Boolean(props.onClick || props.href) && 'hover:bg-hover',
    className,
  );

  if (props.onClick) {
    return (
      <BaseButton
        ariaLabel={props.ariaLabel}
        className={rowClassName}
        data-testid={dataTestId}
        onClick={() => props.onClick?.()}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <ListRowContent
          description={description}
          leading={leading}
          meta={meta}
          title={title}
          trailing={trailing}
        />
      </BaseButton>
    );
  }

  if (props.href) {
    return (
      <Link
        aria-label={props.ariaLabel}
        className={rowClassName}
        data-testid={dataTestId}
        href={props.href}
      >
        <ListRowContent
          description={description}
          leading={leading}
          meta={meta}
          title={title}
          trailing={trailing}
        />
      </Link>
    );
  }

  return (
    <div className={rowClassName} data-testid={dataTestId}>
      <ListRowContent
        description={description}
        leading={leading}
        meta={meta}
        title={title}
        trailing={trailing}
      />
    </div>
  );
}

export default ListRow;
