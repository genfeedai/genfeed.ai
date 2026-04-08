import { ButtonVariant, CardEmptySize, CardVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { CardEmptyProps } from '@props/ui/cards/card-empty.props';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import { Button } from '@ui/primitives/button';

const SIZE_CLASSES = {
  [CardEmptySize.DEFAULT]: {
    icon: 'w-16 h-16',
    title: 'text-xl',
  },
  [CardEmptySize.LG]: {
    icon: 'w-20 h-20',
    title: 'text-2xl',
  },
  [CardEmptySize.SM]: {
    icon: 'w-12 h-12',
    title: 'text-lg',
  },
};

/**
 * CardEmptyContent - Empty state content without card wrapper
 */
export function CardEmptyContent({
  icon: Icon,
  iconClassName,
  label,
  description,
  action,
  className,
  size = CardEmptySize.DEFAULT,
}: CardEmptyProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center text-center py-12',
        'bg-gradient-radial from-white/[0.02] to-transparent',
        className,
      )}
    >
      {Icon && (
        <CardIcon
          icon={Icon}
          className="mb-6 ring-1 ring-inset ring-white/10 rounded-full p-4"
          iconClassName={cn(
            'text-foreground/40',
            SIZE_CLASSES[size].icon,
            iconClassName,
          )}
        />
      )}

      {label && (
        <h3
          className={cn(
            'font-semibold text-foreground mb-2',
            SIZE_CLASSES[size].title,
          )}
        >
          {label}
        </h3>
      )}

      {description && (
        <p className="text-foreground/60 max-w-md mb-6">{description}</p>
      )}

      {action && (
        <Button
          withWrapper={false}
          variant={action.variant || ButtonVariant.DEFAULT}
          onClick={action.onClick}
          ariaLabel={action.ariaLabel || action.label}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * CardEmpty - Empty state wrapped in a card
 */
export default function CardEmpty({
  icon,
  iconClassName,
  label,
  description,
  action,
  className,
  size = CardEmptySize.DEFAULT,
  variant = CardVariant.DEFAULT,
}: CardEmptyProps) {
  return (
    <Card variant={variant} className={className} bodyClassName="p-0">
      <CardEmptyContent
        icon={icon}
        iconClassName={iconClassName}
        label={label}
        description={description}
        action={action}
        size={size}
      />
    </Card>
  );
}
