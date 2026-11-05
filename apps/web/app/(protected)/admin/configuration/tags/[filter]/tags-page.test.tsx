import { PageScope } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import TagsPage from './tags-page';

vi.mock('./tags-layout', () => ({
  default: ({
    children,
    rightActions,
    refreshAction,
  }: {
    children: React.ReactNode;
    rightActions?: React.ReactNode;
    refreshAction?: React.ReactNode;
  }) => (
    <div data-testid="tags-layout">
      {refreshAction}
      {rightActions}
      {children}
    </div>
  ),
}));

vi.mock('./tags-list', () => ({
  default: () => <div data-testid="tags-list" />,
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
}));

describe('TagsPage', () => {
  it('renders the tag list inside the tags layout', () => {
    render(<TagsPage filter="all" scope={PageScope.SUPERADMIN} />);

    expect(screen.getByTestId('tags-layout')).toContainElement(
      screen.getByTestId('tags-list'),
    );
  });
});
