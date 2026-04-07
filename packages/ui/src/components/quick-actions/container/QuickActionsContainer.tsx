import type { QuickActionsContainerProps } from '@props/content/quick-actions.props';
import { memo } from 'react';

const QuickActionsContainer = memo(
  ({
    children,
    position = 'bottom-right',
    className = '',
  }: QuickActionsContainerProps) => {
    const positionClasses = {
      'bottom-left': 'bottom-2 left-2',
      'bottom-right': 'bottom-2 right-2',
      'top-left': 'top-2 left-2',
      'top-right': 'top-2 right-2',
    };

    return (
      <div
        className={`absolute z-50 ${positionClasses[position]} ${className}`}
      >
        {children}
      </div>
    );
  },
);

export default QuickActionsContainer;
