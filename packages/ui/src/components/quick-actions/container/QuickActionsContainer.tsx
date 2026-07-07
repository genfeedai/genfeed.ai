import type { QuickActionsContainerProps } from '@genfeedai/props/content/quick-actions.props';
import { memo } from 'react';

const POSITION_CLASSES = {
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-2 right-2',
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
};

const QuickActionsContainer = memo(
  ({
    children,
    position = 'bottom-right',
    className = '',
  }: QuickActionsContainerProps) => {
    return (
      <div
        className={`absolute z-50 ${POSITION_CLASSES[position]} ${className}`}
      >
        {children}
      </div>
    );
  },
);

export default QuickActionsContainer;
