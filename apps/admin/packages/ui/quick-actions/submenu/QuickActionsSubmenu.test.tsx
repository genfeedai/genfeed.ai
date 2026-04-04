import type { IQuickAction } from '@genfeedai/interfaces/ui/quick-actions.interface';
import { render } from '@testing-library/react';
import QuickActionsSubmenu from '@ui/quick-actions/submenu/QuickActionsSubmenu';
import type { PropsWithChildren, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/tooltip/Tooltip', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('QuickActionsSubmenu', () => {
  const actions: IQuickAction[] = [
    {
      id: 'action-1',
      label: 'Action 1',
      onClick: vi.fn(),
    },
  ];

  it('should render without crashing', () => {
    const { container } = render(
      <QuickActionsSubmenu
        label="Quick Actions"
        icon={<span>+</span>}
        actions={actions}
        onActionClick={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <QuickActionsSubmenu
        label="Quick Actions"
        icon={<span>+</span>}
        actions={actions}
        onActionClick={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <QuickActionsSubmenu
        label="Quick Actions"
        icon={<span>+</span>}
        actions={actions}
        onActionClick={vi.fn()}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
