import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CardProps } from '@genfeedai/props/ui/ui.props';
import CardIcon from '@ui/card/icon/CardIcon';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { memo } from 'react';

const VARIANT_CLASSES: Record<CardVariant, string> = {
  [CardVariant.DEFAULT]: 'shadow-border bg-card text-card-foreground',
  [CardVariant.WHITE]: 'border border-border bg-card text-card-foreground',
  [CardVariant.BLACK]: 'border border-border bg-card text-card-foreground',
};

const INTERACTIVE_VARIANT_CLASSES: Record<CardVariant, string> = {
  [CardVariant.DEFAULT]: 'hover:shadow-border-strong',
  [CardVariant.WHITE]: 'hover:border-border-strong',
  [CardVariant.BLACK]: 'hover:border-border-strong',
};

const Card = memo(function Card({
  index = 0,
  variant = CardVariant.DEFAULT,
  children,
  actions,
  headerAction,
  figure,
  overlay,
  className,
  bodyClassName,
  icon,
  iconWrapperClassName,
  iconClassName,
  id,
  label,
  description,
  isDisabled,
  onClick,
  'data-testid': dataTestId,
}: CardProps) {
  const cardClasses = cn(
    'relative rounded-card text-left transition-[border-color,background-color] duration-150 ease-out',
    // Overlay images clip to the radius. overflow-hidden on every card is a
    // clipping ancestor for Radix popovers (model picker, select) and shrinks
    // --radix-popover-content-available-height to the card interior.
    overlay && 'overflow-hidden',
    id && 'scroll-mt-20',
    VARIANT_CLASSES[variant],
    figure && 'flex flex-row',
    onClick && 'cursor-pointer',
    isDisabled && 'cursor-not-allowed opacity-60',
    onClick && INTERACTIVE_VARIANT_CLASSES[variant],
    className,
  );

  const cardContent = (
    <>
      {overlay && (
        <figure className="absolute inset-0 z-0">
          <Image
            src={overlay}
            alt="Overlay"
            fill
            sizes="100vw"
            className="object-cover object-center outline-media"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </figure>
      )}

      <div
        className={cn('relative z-10 flex flex-col gap-3 p-4', bodyClassName)}
      >
        {(icon || label || description) && (
          <div className={cn('flex items-start gap-3', children && 'mb-1')}>
            {icon && (
              <CardIcon
                icon={icon}
                className={iconWrapperClassName}
                iconClassName={iconClassName}
              />
            )}

            {(label || description || headerAction) && (
              <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {label && (
                    <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">
                      {label}
                    </h3>
                  )}
                  {description && (
                    <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-muted-foreground">
                      {description}
                    </p>
                  )}
                </div>
                {headerAction}
              </div>
            )}
          </div>
        )}

        {children}

        {actions && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            {actions}
          </div>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <Button
        aria-label={typeof label === 'string' ? label : undefined}
        data-card-index={index}
        data-testid={dataTestId}
        id={id}
        onClick={onClick}
        isDisabled={isDisabled}
        className={cardClasses}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        {cardContent}
      </Button>
    );
  }

  return (
    <div
      className={cardClasses}
      data-card-index={index}
      data-testid={dataTestId}
      id={id}
    >
      {cardContent}
    </div>
  );
});

export default Card;
