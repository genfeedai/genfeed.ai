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
  search: '',
  setSearch: vi.fn(),
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

vi.mock('@ui/content/admin-filters/useAdminSearchParam', () => ({
  useAdminSearchParam: () => ({
    search: mocks.search,
    setSearch: mocks.setSearch,
  }),
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

/** One module card on the page. */
const CARD = '[data-testid^="flag-card-"]';

describe('AdminFlagsPage (#5468)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
    mocks.getSettings.mockResolvedValue({ flags: { analytics: false } });
    mocks.updateSettings.mockResolvedValue({
      flags: { analytics: false, studio: false },
    });
  });

  it('narrows the cards to the flags that match the search', async () => {
    mocks.search = 'analytics';
    render(<AdminFlagsPage />);

    expect(
      await screen.findByRole('switch', { name: 'Analytics' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Studio' }),
    ).not.toBeInTheDocument();
  });

  it('says so when no flag matches the search', async () => {
    mocks.search = 'no such flag';
    render(<AdminFlagsPage />);

    expect(
      await screen.findByText('No flags match your search'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
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
    expect(
      screen.getByRole('heading', { name: 'Releases' }),
    ).toBeInTheDocument();
  });

  it('links the releases section to per-organization release access', async () => {
    render(<AdminFlagsPage />);

    expect(
      await screen.findByRole('link', {
        name: 'Set release preview per organization',
      }),
    ).toHaveAttribute('href', '/admin/organizations');
  });

  it('lists releases off until an operator releases them', async () => {
    mocks.getSettings.mockResolvedValue({ flags: { release_turbo: true } });
    render(<AdminFlagsPage />);

    expect(
      await screen.findByRole('switch', { name: 'Release Turbo' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('switch', { name: 'Release Motion' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('switch', { name: 'Release Campaigns' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('gives each app its own card, with its features inside', async () => {
    render(<AdminFlagsPage />);

    const studioSwitch = await screen.findByRole('switch', { name: 'Studio' });
    expect(studioSwitch.closest(CARD)).toHaveAttribute(
      'data-testid',
      'flag-card-studio',
    );
    for (const [name, key] of [
      ['Motion', 'motion'],
      ['Storyboard', 'storyboard'],
      ['Clipper', 'clipper'],
      ['Turbo', 'turbo'],
      ['Editor', 'editor'],
    ]) {
      expect(
        screen.getByRole('switch', { name }).closest(CARD),
      ).toHaveAttribute('data-testid', `flag-card-${key}`);
    }
    expect(
      screen.getByRole('switch', { name: 'Turbo ideas' }).closest(CARD),
    ).toHaveAttribute('data-testid', 'flag-card-turbo');
    expect(
      screen.getByRole('switch', { name: 'Library canvas' }).closest(CARD),
    ).toHaveAttribute('data-testid', 'flag-card-library');
    expect(
      screen.getByRole('switch', { name: 'Replies' }).closest(CARD),
    ).toHaveAttribute('data-testid', 'flag-card-messages');
  });

  it('names the switched-off flag that keeps a nested row off', async () => {
    mocks.getSettings.mockResolvedValue({ flags: { turbo: false } });
    render(<AdminFlagsPage />);

    const turboIdeas = await screen.findByRole('switch', {
      name: 'Turbo ideas',
    });
    expect(turboIdeas).toBeDisabled();
    expect(turboIdeas.getAttribute('aria-description')).toContain(
      'Off while Turbo is off.',
    );
    expect(screen.getByRole('switch', { name: 'Motion' })).toBeEnabled();
  });

  it('lists every Studio app as its own switch', async () => {
    render(<AdminFlagsPage />);

    for (const name of ['Motion', 'Storyboard', 'Clipper', 'Turbo', 'Editor']) {
      expect(await screen.findByRole('switch', { name })).toBeInTheDocument();
    }
  });

  it('disables nested switches while their parent is off', async () => {
    mocks.getSettings.mockResolvedValue({
      flags: { library: false, library_canvas: true },
    });
    render(<AdminFlagsPage />);

    const canvas = await screen.findByRole('switch', {
      name: 'Library canvas',
    });
    expect(canvas).toBeDisabled();
    expect(canvas).toHaveAttribute('aria-checked', 'true');
    expect(canvas.getAttribute('aria-description')).toContain(
      'Off while Library is off.',
    );
    expect(screen.getByRole('switch', { name: 'Turbo ideas' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Motion' })).toBeEnabled();
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
    expect(mocks.success).not.toHaveBeenCalled();
    expect(notifyPlatformFlagsChanged).toHaveBeenCalledTimes(1);
  });

  it('locks every switch while one save is in flight', async () => {
    let finishSave: (value: { flags: Record<string, boolean> }) => void = () =>
      undefined;
    mocks.updateSettings.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    render(<AdminFlagsPage />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Studio' }));

    await waitFor(() => {
      for (const toggle of screen.getAllByRole('switch')) {
        expect(toggle).toBeDisabled();
      }
    });

    finishSave({ flags: { studio: false } });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Agent' })).toBeEnabled(),
    );
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

  it('shows every module and feature on, and every release off, before an operator changed any', async () => {
    mocks.getSettings.mockResolvedValue({ flags: {} });
    render(<AdminFlagsPage />);

    await screen.findByRole('switch', { name: 'Library canvas' });
    for (const toggle of screen.getAllByRole('switch')) {
      const isRelease = toggle
        .getAttribute('aria-label')
        ?.startsWith('Release ');
      expect(toggle).toHaveAttribute(
        'aria-checked',
        isRelease ? 'false' : 'true',
      );
    }
    expect(DEFAULT_PLATFORM_FLAGS.library_canvas).toBe(true);
  });
});
