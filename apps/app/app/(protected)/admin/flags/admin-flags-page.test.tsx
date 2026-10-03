import {
  DEFAULT_PLATFORM_FLAGS,
  PLATFORM_FLAG_KEYS,
} from '@genfeedai/contracts/constants';
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

vi.mock('@ui/primitives/alert', () => ({
  Alert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock('@ui/typography/heading', () => ({
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    'aria-label': ariaLabel,
    description,
    isChecked,
    isDisabled,
    onCheckedChange,
  }: {
    'aria-label'?: string;
    description?: string;
    isChecked?: boolean;
    isDisabled?: boolean;
    onCheckedChange?: (isChecked: boolean) => void;
  }) => (
    <button
      aria-checked={isChecked}
      aria-description={description}
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

  it('lists every flag on one page with its stored state', async () => {
    render(<AdminFlagsPage />);

    expect(
      await screen.findByRole('switch', { name: 'Analytics' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Studio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getAllByRole('switch')).toHaveLength(
      PLATFORM_FLAG_KEYS.length,
    );
    expect(
      screen.getByRole('heading', { name: 'Modules' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Platform' }),
    ).toBeInTheDocument();
  });

  it('lists every Studio surface as its own switch', async () => {
    render(<AdminFlagsPage />);

    for (const name of ['Motion', 'Storyboard', 'Clips', 'Batch', 'Editor']) {
      expect(await screen.findByRole('switch', { name })).toBeInTheDocument();
    }
  });

  it('disables nested switches while their parent is off', async () => {
    mocks.getSettings.mockResolvedValue({
      flags: { studio: false, studio_motion: true },
    });
    render(<AdminFlagsPage />);

    const motion = await screen.findByRole('switch', { name: 'Motion' });
    expect(motion).toBeDisabled();
    expect(motion).toHaveAttribute('aria-checked', 'true');
    expect(motion.getAttribute('aria-description')).toContain(
      'Off while Studio is off.',
    );
    expect(screen.getByRole('switch', { name: 'Batch ideas' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Agent' })).toBeEnabled();
  });

  it('saves only the switched flag, at once', async () => {
    render(<AdminFlagsPage />);

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
    render(<AdminFlagsPage />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Studio' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(notifyPlatformFlagsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Studio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows the load failure instead of default switches', async () => {
    mocks.getSettings.mockRejectedValue(new Error('boom'));
    render(<AdminFlagsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flags could not be loaded',
    );
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('shows every flag on before an operator changed any', async () => {
    mocks.getSettings.mockResolvedValue({ flags: {} });
    render(<AdminFlagsPage />);

    await screen.findByRole('switch', { name: 'Library canvas' });
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    expect(DEFAULT_PLATFORM_FLAGS.library_canvas).toBe(true);
  });
});
