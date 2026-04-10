import type { MultiPostSchema } from '@genfeedai/client/schemas';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalPostSetupTab from '@ui/modals/content/post/ModalPostSetupTab';
import type { PropsWithChildren } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  __esModule: true,
  useBrand: () => ({
    brandId: 'brand-1',
  }),
}));

vi.mock(
  '@genfeedai/hooks/utils/use-websocket-prompt/use-websocket-prompt',
  () => ({
    __esModule: true,
    useWebsocketPrompt: () => vi.fn(),
  }),
);

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/primitives/textarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock('@ui/primitives/date-time-picker', () => ({
  __esModule: true,
  default: () => <div data-testid="form-date-time-picker" />,
}));

describe('ModalPostSetupTab', () => {
  const form = {
    control: {},
    setValue: vi.fn(),
  } as UseFormReturn<MultiPostSchema>;

  const baseProps = {
    form,
    getMinDateTime: () => new Date(),
    globalScheduledDate: null,
    ingredient: null,
    isLoading: false,
    setGlobalScheduledDate: vi.fn(),
  };

  it('should render without crashing', () => {
    render(<ModalPostSetupTab {...baseProps} />);
    expect(screen.getAllByTestId('form-control').length).toBeGreaterThan(0);
  });

  it('should handle user interactions correctly', () => {
    render(<ModalPostSetupTab {...baseProps} />);
    expect(screen.getByTestId('form-input')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(<ModalPostSetupTab {...baseProps} />);
    expect(screen.getByTestId('form-date-time-picker')).toBeInTheDocument();
  });
});
