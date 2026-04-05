import { cn } from '@helpers/formatting/cn/cn.util';
import type { CardIconProps } from '@props/ui/ui.props';
import { isValidElement } from 'react';

export default function CardIcon({
  icon,
  className,
  iconClassName,
  label,
}: CardIconProps) {
  // When the wrapper supplies a text color, let the icon inherit it.
  // Explicit color classes in iconClassName still win because they merge later.
  const defaultIconClassName = className ? 'w-4 h-4' : 'w-4 h-4 text-primary';

  // Handle both ReactNode (already rendered) and ComponentType (function)
  const iconElement = isValidElement(icon)
    ? icon
    : (() => {
        const Icon = icon as React.ComponentType<{ className?: string }>;
        return <Icon className={cn(defaultIconClassName, iconClassName)} />;
      })();

  return (
    <div className={cn('rounded-lg', className)}>
      {iconElement}
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
