import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModalMusic from '@ui/modals/ingredients/music/ModalMusic';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  findAll: vi.fn(),
}));

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn(() =>
      Promise.resolve({
        findAll: mocks.findAll,
      }),
    ),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: mocks.closeModal,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

describe('ModalMusic', () => {
  const defaultProps = {
    brandId: 'brand-1',
    id: 'modal-music',
    onConfirm: vi.fn(),
    selectedMusicId: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([]);
  });

  it('renders music selection modal', () => {
    render(<ModalMusic {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('reflects parent selection changes without remounting', async () => {
    const { rerender } = render(
      <ModalMusic {...defaultProps} selectedMusicId="music-1" />,
    );

    expect(
      screen.getByRole('button', { name: 'Use Selected Music' }),
    ).toBeInTheDocument();

    rerender(<ModalMusic {...defaultProps} selectedMusicId="" />);

    expect(
      screen.getByRole('button', { name: 'Continue Without Music' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.findAll).toHaveBeenCalled());
  });

  it('confirms a user-selected track exactly once', async () => {
    const music = {
      id: 'music-1',
      ingredientUrl: 'https://example.com/music.mp3',
      metadata: { label: 'Focus Track' },
      metadataDuration: 120,
    };
    const onConfirm = vi.fn();
    mocks.findAll.mockResolvedValue([music]);

    render(<ModalMusic {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole('button', { name: /Focus Track/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Selected Music' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(music);
  });
});
