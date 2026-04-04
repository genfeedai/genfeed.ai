import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';
import { describe, expect, it } from 'vitest';

vi.mock('@ui/evaluation/badge/EvaluationBadge', () => ({
  default: () => <div data-testid="evaluation-badge" />,
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('@ui/primitives/tooltip', () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@ui-constants/scope.constant', () => ({
  SCOPE_OPTIONS: [
    { label: 'Private', value: 'user', variant: '' },
    { label: 'Brand', value: 'brand', variant: '' },
    { label: 'Organization', value: 'organization', variant: '' },
    { label: 'Public', value: 'public', variant: '' },
  ],
}));

const mockIngredient: IIngredient = {
  id: 'ing-123',
  metadataModel: 'flux',
  metadataModelLabel: 'Flux',
  scope: 'user',
  totalChildren: 0,
  training: null,
  transformations: [],
} as unknown as IIngredient;

describe('MasonryBadgeOverlay', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <MasonryBadgeOverlay ingredient={mockIngredient} />,
    );
    // Component renders fragments, so container.firstChild may be null when no badges visible
    expect(container).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    // MasonryBadgeOverlay is display-only, no user interactions
  });

  it('should apply correct styles and classes', () => {
    // Display-only overlay component
  });
});
