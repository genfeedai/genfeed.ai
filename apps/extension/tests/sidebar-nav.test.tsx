import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarNav } from '~components/navigation/SidebarNav';

describe('SidebarNav', () => {
  it('lists Reply before Create', () => {
    render(<SidebarNav activeTab="reply" onTabChange={vi.fn()} />);

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

    expect(labels.slice(0, 3)).toEqual(['Reply', 'Create', 'Remix']);
  });
});
