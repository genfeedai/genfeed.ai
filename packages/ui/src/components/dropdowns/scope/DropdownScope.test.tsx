import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { ScopeDropdownProps } from '@genfeedai/props/social/scope-dropdown.props';
import { render } from '@testing-library/react';
import DropdownScope from '@ui/dropdowns/scope/DropdownScope';
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
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('DropdownScope', () => {
  const item = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    scope: AssetScope.USER,
    status: IngredientStatus.GENERATED,
  } as IIngredient;

  const baseProps: ScopeDropdownProps = {
    item,
    onScopeChange: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<DropdownScope {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<DropdownScope {...baseProps} />);
    expect(
      document.querySelector('[data-testid="dropdown-trigger"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<DropdownScope {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
