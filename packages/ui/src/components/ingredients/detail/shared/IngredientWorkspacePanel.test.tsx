// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { TabsEnhancedProps } from '@genfeedai/props/ui/navigation/tabs.props';
import { render, screen } from '@testing-library/react';
import IngredientWorkspacePanel from '@ui/ingredients/detail/shared/IngredientWorkspacePanel';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: ({ children, contentClassName, fullWidth }: TabsEnhancedProps) => (
    <div
      data-content-class={contentClassName}
      data-full-width={String(fullWidth)}
      data-testid="workspace-tabs"
    >
      {children}
    </div>
  ),
}));

describe('IngredientWorkspacePanel', () => {
  it('uses shared navigation for dense asset details', () => {
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
      'data-full-width',
      'false',
    );
    expect(screen.getByTestId('workspace-tabs')).toHaveAttribute(
      'data-content-class',
      'mt-5 space-y-5',
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
