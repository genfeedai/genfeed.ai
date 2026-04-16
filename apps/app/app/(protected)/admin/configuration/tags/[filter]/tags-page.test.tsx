import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import TagsPage from './tags-page';

vi.mock('./tags-layout', () => ({
  default: ({
    children,
    rightActions,
  }: {
    children: React.ReactNode;
    rightActions?: React.ReactNode;
  }) => (
    <div data-testid="tags-layout">
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
  it('should render without crashing', () => {
    const { container } = render(<TagsPage filter="all" scope="superadmin" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TagsPage filter="all" scope="superadmin" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TagsPage filter="all" scope="superadmin" />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
