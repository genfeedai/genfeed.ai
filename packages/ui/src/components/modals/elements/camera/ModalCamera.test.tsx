import { render, screen } from '@testing-library/react';
import ModalCamera from '@ui/modals/elements/camera/ModalCamera';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/modal/Modal').default
  >) => <div data-testid="modal">{children}</div>,
}));

describe('ModalCamera', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders camera modal', () => {
    render(<ModalCamera {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
