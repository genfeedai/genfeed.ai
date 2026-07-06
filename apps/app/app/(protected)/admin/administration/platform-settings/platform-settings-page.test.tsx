import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformSettingsPage from './platform-settings-page';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getSettings: vi.fn(),
  success: vi.fn(),
  updateSettings: vi.fn(),
  warning: vi.fn(),
}));

const getPlatformSettingsService = vi.hoisted(() =>
  vi.fn(async () => ({
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
  })),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getPlatformSettingsService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.error,
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
  warning: mocks.warning,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description: string;
    label: string;
  }) => (
    <section aria-label={label}>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    isDisabled?: boolean;
  }) => (
    <button disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({
    children,
    helpText,
    htmlFor,
    label,
  }: {
    children: ReactNode;
    helpText?: string;
    htmlFor: string;
    label: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {helpText ? <p>{helpText}</p> : null}
    </div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('PlatformSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({
      id: 'platform-settings',
      marginMultiplier: 1.25,
    });
    mocks.updateSettings.mockResolvedValue({
      id: 'platform-settings',
      marginMultiplier: 1.5,
    });
  });

  it('loads platform settings with an abort signal', async () => {
    render(<PlatformSettingsPage />);

    await waitFor(() => {
      expect(mocks.getSettings).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    expect(screen.getByLabelText('Model-cost margin multiplier')).toHaveValue(
      1.25,
    );
  });

  it('submits a valid multiplier and refreshes the input value', async () => {
    render(<PlatformSettingsPage />);

    const input = await screen.findByLabelText('Model-cost margin multiplier');
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mocks.success).toHaveBeenCalledWith('Platform settings saved');
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      marginMultiplier: 1.5,
    });
    expect(input).toHaveValue(1.5);
  });

  it('blocks invalid and excessive multipliers before saving', async () => {
    render(<PlatformSettingsPage />);

    const input = await screen.findByLabelText('Model-cost margin multiplier');

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mocks.warning).toHaveBeenCalledWith(
      'Margin multiplier must be a positive number',
    );

    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mocks.warning).toHaveBeenCalledWith(
      'Margin multiplier cannot exceed 10',
    );
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
