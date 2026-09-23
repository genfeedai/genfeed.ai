import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalCreateThread from '@ui/modals/content/create-thread/ModalCreateThread';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const mocks = vi.hoisted(() => ({
  createThread: vi.fn().mockResolvedValue([]),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ createThread: mocks.createThread }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-workspace' }),
}));

describe('ModalCreateThread', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  it('saves an account-free thread draft and hides scheduling', async () => {
    const user = userEvent.setup();
    render(<ModalCreateThread {...defaultProps} />);
    const editors = screen
      .getAllByRole('textbox')
      .filter((element) => element.tagName === 'TEXTAREA');
    await user.type(editors[0], 'First tweet');
    await user.type(editors[1], 'Second tweet');
    expect(
      screen.queryByText('Scheduled Date (Optional)'),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Create Thread (2 posts)' }),
    );
    await waitFor(() =>
      expect(mocks.createThread).toHaveBeenCalledWith({
        posts: [
          expect.objectContaining({
            brandId: 'brand-workspace',
            credentialId: undefined,
            platform: 'twitter',
            description: 'First tweet',
            targetExecutionState: 'draft',
          }),
          expect.objectContaining({
            brandId: 'brand-workspace',
            credentialId: undefined,
            platform: 'twitter',
            description: 'Second tweet',
            targetExecutionState: 'draft',
          }),
        ],
      }),
    );
  });

  it('renders create thread modal', () => {
    render(<ModalCreateThread {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders the shared segmented tab labels', () => {
    render(<ModalCreateThread {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Compose' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Preview/i })).toBeInTheDocument();
  });
});
