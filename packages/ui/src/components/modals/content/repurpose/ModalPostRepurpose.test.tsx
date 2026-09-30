import { Platform, PostRepurposeMode } from '@genfeedai/contracts';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModalPostRepurpose from '@ui/modals/content/repurpose/ModalPostRepurpose';

vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children, title }: ModalProps) => (
    <div data-testid="modal">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  __esModule: true,
  Button: ({
    label,
    children,
    onClick,
    isDisabled,
  }: PropsWithChildren<{
    label?: string;
    onClick?: () => void;
    isDisabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} disabled={isDisabled}>
      {label || children}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children, label }: PropsWithChildren<{ label?: string }>) => (
    <div data-testid="form-control">
      <div>{label}</div>
      {children}
    </div>
  ),
}));

vi.mock('@ui/primitives/radio-group', () => ({
  __esModule: true,
  RadioGroup: ({
    children,
    onValueChange,
  }: PropsWithChildren<{ onValueChange?: (value: string) => void }>) => (
    <div
      data-testid="radio-group"
      onClick={(event) => {
        const value = (event.target as HTMLElement)
          .closest('[data-value]')
          ?.getAttribute('data-value');
        if (value) {
          onValueChange?.(value);
        }
      }}
    >
      {children}
    </div>
  ),
  RadioGroupItem: ({ value }: { value: string }) => (
    <span data-testid={`radio-${value}`} data-value={value} />
  ),
}));

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

describe('ModalPostRepurpose', () => {
  const baseProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    source: {
      id: 'post-1',
      label: 'Launch recap',
      platform: Platform.LINKEDIN,
    },
  };

  it('renders the supported target channels without the source platform', () => {
    render(<ModalPostRepurpose {...baseProps} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId(`radio-${Platform.TWITTER}`)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`radio-${Platform.LINKEDIN}`),
    ).not.toBeInTheDocument();
  });

  it('keeps the confirm action disabled until a channel is picked', () => {
    render(<ModalPostRepurpose {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
  });

  it('submits the picked platform and mode', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ModalPostRepurpose {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId(`radio-${Platform.TWITTER}`));
    fireEvent.click(screen.getByTestId(`radio-${PostRepurposeMode.AGENT}`));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        Platform.TWITTER,
        PostRepurposeMode.AGENT,
      );
    });
  });
});
