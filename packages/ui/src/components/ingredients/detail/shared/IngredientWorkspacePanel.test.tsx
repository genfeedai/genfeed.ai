// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { TabsEnhancedProps } from '@genfeedai/props/ui/navigation/tabs.props';
import { render, screen } from '@testing-library/react';
import IngredientWorkspacePanel from '@ui/ingredients/detail/shared/IngredientWorkspacePanel';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: ({ fullWidth, size, variant }: TabsEnhancedProps) => (
    <div
      data-full-width={String(fullWidth)}
      data-size={size}
      data-testid="workspace-tabs"
      data-variant={variant}
    />
  ),
}));

describe('IngredientWorkspacePanel', () => {
  it('uses compact underline navigation for dense asset details', () => {
    render(
      <IngredientWorkspacePanel
        activeTab="info"
        onTabChange={vi.fn()}
        tabs={[
          { id: 'info', label: 'Info' },
          { id: 'quality', label: 'Quality' },
        ]}
        title="Refine image details"
      >
        <div>Details</div>
      </IngredientWorkspacePanel>,
    );

    expect(screen.getByTestId('workspace-tabs')).toHaveAttribute(
      'data-variant',
      'underline',
    );
    expect(screen.getByTestId('workspace-tabs')).toHaveAttribute(
      'data-size',
      'sm',
    );
    expect(screen.getByTestId('workspace-tabs')).toHaveAttribute(
      'data-full-width',
      'false',
    );
  });
});
