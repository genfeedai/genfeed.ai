import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCardCollapseToggle } from './AgentCardCollapseToggle';

describe('AgentCardCollapseToggle', () => {
  it('points the chevron down when collapsed and up when expanded', () => {
    const { rerender } = render(
      <AgentCardCollapseToggle isCollapsed onToggle={vi.fn()} />,
    );

    const collapsedIcon = screen
      .getByRole('button', { name: 'Expand' })
      .querySelector('svg');
    expect(collapsedIcon?.getAttribute('class')).toContain('rotate-0');
    expect(collapsedIcon?.getAttribute('class')).not.toContain('-rotate-90');

    rerender(
      <AgentCardCollapseToggle isCollapsed={false} onToggle={vi.fn()} />,
    );

    const expandedIcon = screen
      .getByRole('button', { name: 'Collapse' })
      .querySelector('svg');
    expect(expandedIcon?.getAttribute('class')).toContain('rotate-180');
    expect(expandedIcon?.getAttribute('class')).not.toContain('-rotate-90');
  });
});
