import { CardVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CardProps } from '@genfeedai/props/ui/ui.props';
import CardIcon from '@ui/card/icon/CardIcon';
import Image from 'next/image';
import { memo } from 'react';

const VARIANT_CLASSES: Record<CardVariant, string> = {
  [CardVariant.DEFAULT]:
    'border border-border bg-card text-card-foreground hover:border-border-strong',
  [CardVariant.WHITE]:
    'border border-black/[0.08] bg-white text-black hover:border-black/[0.14]',
  [CardVariant.BLACK]:
    'border border-white/[0.08] bg-black text-white hover:border-white/[0.16]',
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
  label,
  description,
  onClick,
}: CardProps) {
  const cardClasses = cn(
    'relative overflow-hidden rounded-md text-left transition-[border-color,background-color] duration-150 ease-out',
    VARIANT_CLASSES[variant],
    figure && 'flex flex-row',
    onClick && 'cursor-pointer',
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
            className="object-cover object-center"
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
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
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
      <div
        role="button"
        tabIndex={0}
        aria-label={typeof label === 'string' ? label : undefined}
        data-card-index={index}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={cardClasses}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div className={cardClasses} data-card-index={index}>
      {cardContent}
    </div>
  );
});

export default Card;
