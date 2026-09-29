import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminFlagsPage from './admin-flags-page';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getSettings: vi.fn(),
  success: vi.fn(),
  updateSettings: vi.fn(),
}));

const notifyPlatformFlagsChanged = vi.hoisted(() => vi.fn());

vi.mock('@/lib/platform-flags/platform-flags-sync', () => ({
  notifyPlatformFlagsChanged,
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

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  const translations = new Map<
    string,
    ReturnType<typeof translateFromCatalog>
  >();
  return {
    useTranslations: (namespace: string) => {
      if (!translations.has(namespace))
        translations.set(namespace, translateFromCatalog(namespace));
      return translations.get(namespace);
    },
  };
});

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notificationsServiceInstance },
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section aria-label={label}>{children}</section>
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    'aria-label': ariaLabel,
    isChecked,
    isDisabled,
    onCheckedChange,
  }: {
    'aria-label'?: string;
    isChecked?: boolean;
    isDisabled?: boolean;
    onCheckedChange?: (isChecked: boolean) => void;
  }) => (
    <button
      aria-checked={isChecked}
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={() => onCheckedChange?.(!isChecked)}
      role="switch"
      type="button"
    />
  ),
}));

describe('AdminFlagsPage (#5468)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({ flags: { analytics: false } });
    mocks.updateSettings.mockResolvedValue({
      flags: { analytics: false, studio: false },
    });
  });

  it('lists every module with its stored state', async () => {
    render(<AdminFlagsPage kind="modules" />);

    expect(
      await screen.findByRole('switch', { name: 'Analytics' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Studio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getAllByRole('switch')).toHaveLength(9);
    expect(
      screen.queryByRole('switch', { name: 'Library canvas' }),
    ).not.toBeInTheDocument();
  });

  it('saves only the switched flag, at once', async () => {
    render(<AdminFlagsPage kind="modules" />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Studio' }));

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        flags: { studio: false },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Studio' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
    expect(mocks.success).toHaveBeenCalledWith('Studio switched Off');
    expect(notifyPlatformFlagsChanged).toHaveBeenCalledTimes(1);
  });

  it('reverts the switch when the save fails', async () => {
    mocks.updateSettings.mockRejectedValue(new Error('boom'));
    render(<AdminFlagsPage kind="modules" />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Studio' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(notifyPlatformFlagsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Studio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows every flag on before an operator changed any', async () => {
    mocks.getSettings.mockResolvedValue({ flags: {} });
    render(<AdminFlagsPage kind="features" />);

    await screen.findByRole('switch', { name: 'Library canvas' });
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    expect(DEFAULT_PLATFORM_FLAGS.library_canvas).toBe(true);
  });
});
