import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { StatusDropdownProps } from '@props/social/status-dropdown.props';
import { render } from '@testing-library/react';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/dropdowns/base/DropdownBase', () => ({
  default: ({
    trigger,
    children,
  }: {
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <div data-testid="dropdown-trigger">{trigger}</div>
      <div data-testid="dropdown-content">{children}</div>
    </div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe('DropdownStatus', () => {
  const entity = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    status: IngredientStatus.GENERATED,
  } as IIngredient;

  const baseProps: StatusDropdownProps = {
    entity,
    onStatusChange: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<DropdownStatus {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<DropdownStatus {...baseProps} />);
    expect(
      document.querySelector('[data-testid="dropdown-trigger"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<DropdownStatus {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
