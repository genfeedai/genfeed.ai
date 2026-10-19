import * as domMatchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

vi.mock('./system-notifications-panel', () => ({
  default: () => <div data-testid="system-notifications-panel" />,
}));

import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { PlatformSettingsTab } from '@props/admin/platform-settings.props';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  type ButtonHTMLAttributes,
  Children,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useState,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformSettingsLayout from './layout';
import PlatformSettingsSection from './platform-settings-section';

expect.extend(domMatchers);

// Flags are edited on Admin → Flags (#5468) and Featured pins on Admin →
// Automation → Workflows (#5511); the settings page never resends either.
const {
  featuredWorkflowIds: _featuredWorkflowIds,
  flags: _flags,
  ...SAVED_SWITCHES
} = DEFAULT_PLATFORM_FEATURE_SETTINGS;

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getBrandVisionModels: vi.fn(),
  getSettings: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  updateSettings: vi.fn(),
  warning: vi.fn(),
}));

const getPlatformSettingsService = vi.hoisted(() =>
  vi.fn(async () => ({
    getBrandVisionModels: mocks.getBrandVisionModels,
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
  })),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

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
    useFormatter: () => ({
      dateTime: (date: Date) => date.toISOString(),
    }),
    useTranslations: (namespace: string) => {
      if (!translations.has(namespace))
        translations.set(namespace, translateFromCatalog(namespace));
      return translations.get(namespace);
    },
  };
});

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
    label,
    refresh,
    right,
  }: {
    children: ReactNode;
    label: string;
    refresh?: ReactNode;
    right?: ReactNode;
  }) => (
    <section aria-label={label}>
      <div data-testid="subbar">
        {refresh}
        {right}
      </div>
      {children}
    </section>
  ),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} type="button">
      Refresh
    </button>
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
    error,
    helpText,
    htmlFor,
    label,
  }: {
    children: ReactNode;
    error?: string;
    helpText?: string;
    htmlFor: string;
    label: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {helpText ? <p>{helpText}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  ),
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
    <div>
      <button
        aria-checked={isChecked}
        aria-label={ariaLabel}
        disabled={isDisabled}
        onClick={() => onCheckedChange?.(!isChecked)}
        role="switch"
        type="button"
      />
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

/**
 * Native selects stand in for the Radix ones: this suite is about the page's
 * load/save wiring, and Radix's portalled listbox needs a pointer environment
 * jsdom does not provide. The page renders several Selects (margin input mode,
 * typed-decision provider, feature modes), so the mock reads each one's `data-testid` off
 * its `SelectTrigger`'s `id` instead of hardcoding a single shared test id.
 */
vi.mock('@ui/primitives/select', () => {
  const SelectTrigger = () => null;

  function testIdFromChildren(children: ReactNode): string | undefined {
    let testId: string | undefined;
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.type === SelectTrigger) {
        testId = (child as ReactElement<{ id?: string }>).props.id;
      }
    });
    return testId;
  }

  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      disabled?: boolean;
      onValueChange: (value: string) => void;
      value: string;
    }) => (
      <select
        data-testid={testIdFromChildren(children)}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => <option value={value}>{children}</option>,
    SelectTrigger,
    SelectValue: () => null,
  };
});

/** A short-labelled field inside the settings group titled `group`. */
function fieldIn(group: string, label: string): HTMLElement {
  return within(screen.getByRole('region', { name: group })).getByLabelText(
    label,
  );
}

const PAGES: readonly { label: string; tab: PlatformSettingsTab }[] = [
  { label: 'Billing', tab: 'billing' },
  { label: 'AI', tab: 'ai' },
  { label: 'Agent', tab: 'agent' },
  { label: 'Media', tab: 'media' },
  { label: 'Providers', tab: 'providers' },
  { label: 'Accounts', tab: 'accounts' },
  { label: 'Notifications', tab: 'notifications' },
];

/**
 * The settings layout with its pages swapped by a stand-in for the rail: the
 * layout (and so the settings state) stays mounted while the page changes,
 * as it does between /admin/settings routes.
 */
function PlatformSettingsPage() {
  const [tab, setTab] = useState<PlatformSettingsTab>('billing');

  return (
    <PlatformSettingsLayout>
      <nav>
        {PAGES.map((page) => (
          <button
            key={page.tab}
            aria-current={tab === page.tab ? 'page' : undefined}
            onClick={() => setTab(page.tab)}
            role="tab"
            type="button"
          >
            {page.label}
          </button>
        ))}
      </nav>
      <PlatformSettingsSection tab={tab} />
    </PlatformSettingsLayout>
  );
}

/** Open a settings page once the settings have loaded. */
async function openTab(name: string): Promise<void> {
  await screen.findByRole('button', { name: /save settings/i });
  fireEvent.click(screen.getByRole('tab', { name }));
}

const OCR_OPTION = {
  externalId: 'lucataco/florence-2-large:da53547e',
  key: 'lucataco/florence-2-large',
  label: 'Florence-2 Large (brand OCR)',
  pricingType: 'per-second',
  providerCostUsd: 0.000975,
};
const DETECT_OPTION = {
  externalId: 'adirik/owlvit-base-patch32:5e899f15',
  key: 'adirik/owlvit-base-patch32',
  label: 'OWL-ViT base (brand detection)',
  pricingType: 'per-second',
  providerCostUsd: 0.000225,
};

describe('Platform settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBrandVisionModels.mockResolvedValue({
      detect: [DETECT_OPTION],
      id: 'brand-vision-models',
      ocr: [OCR_OPTION],
    });
    mocks.getSettings.mockResolvedValue({
      id: 'platform-settings',
      marginInputMode: 'MARGIN',
      marginMultiplierAgentChat: 1.7,
      marginMultiplierGeneration: 3.33,
      typedDecisionProvider: 'jev',
    });
    mocks.updateSettings.mockResolvedValue({
      id: 'platform-settings',
      marginInputMode: 'MARGIN',
      marginMultiplierAgentChat: 1.7,
      marginMultiplierGeneration: 4,
      typedDecisionProvider: 'none',
    });
  });

  it('loads platform settings with an abort signal', async () => {
    render(<PlatformSettingsPage />);

    await waitFor(() => {
      expect(mocks.getSettings).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    expect(screen.getByLabelText('Generation margin (%)')).toHaveValue(70);
    expect(screen.getByLabelText('Agent chat margin (%)')).toHaveValue(41);
    expect(
      screen.getByText(
        '$1.00 provider → $3.33 sell · 70% margin · 233% markup',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('$1.00 provider → $1.70 sell · 41% margin · 70% markup'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('platform-margin-input-mode')).toHaveValue(
      'MARGIN',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
    expect(screen.getByTestId('platform-typed-decision-provider')).toHaveValue(
      'jev',
    );
  });

  it('submits an edited generation multiplier and refreshes the input values', async () => {
    render(<PlatformSettingsPage />);

    const input = await screen.findByLabelText('Generation margin (%)');
    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mocks.success).toHaveBeenCalledWith('Platform settings saved');
    });
    // 75% margin => multiplier 1 / (1 - 0.75) = 4; the untouched agent-chat
    // field submits its committed multiplier verbatim, not a re-parsed one.
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      marginInputMode: 'MARGIN',
      marginMultiplierAgentChat: 1.7,
      marginMultiplierGeneration: 4,
      typedDecisionProvider: 'jev',
      ...SAVED_SWITCHES,
    });
    // Refreshed from the mocked server response (marginMultiplierGeneration:
    // 4 => 75% margin), not the stale value from before the save.
    expect(screen.getByLabelText('Generation margin (%)')).toHaveValue(75);
  });

  it('switches input mode without changing an untouched stored multiplier', async () => {
    render(<PlatformSettingsPage />);

    await screen.findByLabelText('Generation margin (%)');
    const modeSelect = screen.getByTestId('platform-margin-input-mode');
    fireEvent.change(modeSelect, { target: { value: 'MARKUP' } });

    expect(screen.getByLabelText('Generation markup (%)')).toHaveValue(233);
    expect(screen.getByLabelText('Agent chat markup (%)')).toHaveValue(70);

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        marginInputMode: 'MARKUP',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        typedDecisionProvider: 'jev',
        ...SAVED_SWITCHES,
      });
    });
  });

  it('saves the typed-decision provider an operator selected', async () => {
    render(<PlatformSettingsPage />);

    await openTab('AI');
    const select = screen.getByTestId('platform-typed-decision-provider');
    fireEvent.change(select, { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mocks.success).toHaveBeenCalledWith('Platform settings saved');
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      marginInputMode: 'MARGIN',
      marginMultiplierAgentChat: 1.7,
      marginMultiplierGeneration: 3.33,
      typedDecisionProvider: 'none',
      ...SAVED_SWITCHES,
    });
    expect(select).toHaveValue('none');
  });

  it('surfaces the server reason when a provider has no credential', async () => {
    mocks.updateSettings.mockRejectedValue({
      response: {
        data: {
          errors: [
            {
              detail:
                'Jev (TypeSafe AI) needs TYPESAFE_API_KEY to be configured on the server',
              status: '400',
            },
          ],
        },
      },
    });
    render(<PlatformSettingsPage />);

    await screen.findByRole('button', { name: /save settings/i });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(
        'Jev (TypeSafe AI) needs TYPESAFE_API_KEY to be configured on the server',
      );
    });
  });

  it('blocks an invalid margin percent before saving', async () => {
    render(<PlatformSettingsPage />);

    const input = await screen.findByLabelText('Generation margin (%)');

    fireEvent.change(input, { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mocks.warning).toHaveBeenCalledWith(
      'Generation margin: Enter a number',
    );

    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mocks.warning).toHaveBeenCalledWith(
      'Generation margin: Margin percent must be less than 100',
    );
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  describe('pages', () => {
    it('opens on Billing and shows one settings page at a time', async () => {
      render(<PlatformSettingsPage />);

      await screen.findByRole('button', { name: /save settings/i });
      expect(screen.getByRole('tab', { name: 'Billing' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.queryByRole('switch', { name: /media perception/i }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: 'Media' }));

      expect(
        screen.getByRole('switch', { name: /media perception/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('spinbutton', { name: 'Generation margin (%)' }),
      ).not.toBeInTheDocument();
    });

    it('puts Save in the subbar, after refresh', async () => {
      render(<PlatformSettingsPage />);

      const subbar = await screen.findByTestId('subbar');
      const buttons = within(subbar).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Refresh',
        'Save settings',
      ]);
    });

    it('reloads the settings on refresh', async () => {
      render(<PlatformSettingsPage />);

      await screen.findByLabelText('Generation margin (%)');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      await waitFor(() => expect(mocks.getSettings).toHaveBeenCalledTimes(2));
    });

    it('keeps edits from every page and saves them together', async () => {
      render(<PlatformSettingsPage />);

      await openTab('Media');
      fireEvent.click(
        screen.getByRole('switch', { name: /media perception/i }),
      );
      fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
      fireEvent.click(
        screen.getByRole('switch', { name: /record system events/i }),
      );
      fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
      fireEvent.change(screen.getByLabelText('Generation margin (%)'), {
        target: { value: '75' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalled());
      const [payload] = mocks.updateSettings.mock.calls[0] ?? [];
      expect(payload).toMatchObject({
        isMediaPerceptionEnabled: false,
        marginMultiplierGeneration: 4,
      });
      expect(payload?.systemEventsEnabledAt).toEqual(expect.any(String));
    });

    it('opens Billing when a save is refused over an invalid margin', async () => {
      render(<PlatformSettingsPage />);

      fireEvent.change(await screen.findByLabelText('Generation margin (%)'), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByRole('tab', { name: 'Agent' }));
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      expect(mocks.updateSettings).not.toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledWith('/admin/settings/billing');
    });

    it('drops an invalid entry when its page is left, so it never blocks a save elsewhere', async () => {
      render(<PlatformSettingsPage />);

      await openTab('AI');
      fireEvent.change(fieldIn('Untrusted content', 'Min confidence'), {
        target: { value: '1.5' },
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a number from 0 to 1',
      );
      fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalled());
      const [payload] = mocks.updateSettings.mock.calls[0] ?? [];
      expect(payload?.untrustedContentMinConfidence).toBe(
        SAVED_SWITCHES.untrustedContentMinConfidence,
      );
    });

    it('keeps destinations and Discord channels together under Notifications', async () => {
      render(<PlatformSettingsPage />);

      await screen.findByRole('button', { name: /save settings/i });
      expect(
        screen.queryByTestId('system-notifications-panel'),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
      expect(
        screen.getByTestId('system-notifications-panel'),
      ).toBeInTheDocument();
      fireEvent.change(fieldIn('Discord channels', 'Deployments'), {
        target: { value: '123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() =>
        expect(mocks.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ discordChannelIdDeployments: '123' }),
        ),
      );
    });
  });

  describe('product feature switches (#5407)', () => {
    it('loads the stored switches', async () => {
      mocks.getSettings.mockResolvedValue({
        id: 'platform-settings',
        isEmailDeliveryConfigured: true,
        isEmailVerificationRequired: true,
        isMediaPerceptionEnabled: false,
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        moderationMode: 'live',
        moderationThresholds: { sexual: 0.4 },
        systemEventsEnabledAt: '2026-09-20T10:00:00.000Z',
        taskRoutingMinConfidence: 0.9,
        typedDecisionProvider: 'none',
      });
      render(<PlatformSettingsPage />);

      await openTab('Media');
      expect(
        screen.getByRole('switch', { name: /media perception/i }),
      ).not.toBeChecked();
      expect(screen.getByTestId('platform-moderation-mode')).toHaveValue(
        'live',
      );
      expect(screen.getByLabelText('Sexual')).toHaveValue(0.4);
      expect(screen.getByLabelText('Violence')).toHaveValue(null);
      fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
      expect(
        screen.getByRole('switch', { name: /require email verification/i }),
      ).toBeChecked();
      expect(
        screen.getByText('Recording since 2026-09-20T10:00:00.000Z'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
      expect(fieldIn('Task routing', 'Min confidence')).toHaveValue(0.9);
    });

    it('makes email verification unavailable when no mailer is configured', async () => {
      mocks.getSettings.mockResolvedValue({
        id: 'platform-settings',
        isEmailDeliveryConfigured: false,
        isEmailVerificationRequired: true,
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        typedDecisionProvider: 'none',
      });
      render(<PlatformSettingsPage />);

      await openTab('Accounts');
      const toggle = screen.getByRole('switch', {
        name: /require email verification/i,
      });
      expect(toggle).toBeDisabled();
      expect(toggle).not.toBeChecked();
      expect(screen.getByText(/RESEND_API_KEY/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalled());
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ isEmailVerificationRequired: true }),
      );
    });

    it('keeps email verification available when the mailer status is unknown', async () => {
      mocks.getSettings.mockResolvedValue({
        id: 'platform-settings',
        isEmailVerificationRequired: true,
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        typedDecisionProvider: 'none',
      });
      render(<PlatformSettingsPage />);

      await openTab('Accounts');
      const toggle = screen.getByRole('switch', {
        name: /require email verification/i,
      });
      expect(toggle).toBeEnabled();
      expect(toggle).toBeChecked();
      expect(screen.queryByText(/RESEND_API_KEY/)).not.toBeInTheDocument();
    });

    it('lets an operator toggle email verification once a mailer is configured', async () => {
      mocks.getSettings.mockResolvedValue({
        id: 'platform-settings',
        isEmailDeliveryConfigured: true,
        isEmailVerificationRequired: false,
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        typedDecisionProvider: 'none',
      });
      render(<PlatformSettingsPage />);

      await openTab('Accounts');
      const toggle = screen.getByRole('switch', {
        name: /require email verification/i,
      });
      expect(toggle).toBeEnabled();
      expect(screen.queryByText(/RESEND_API_KEY/)).not.toBeInTheDocument();
    });

    it('saves edited switches with the rest of the settings', async () => {
      render(<PlatformSettingsPage />);

      await openTab('Media');
      fireEvent.click(
        screen.getByRole('switch', { name: /media perception/i }),
      );
      fireEvent.change(screen.getByTestId('platform-moderation-mode'), {
        target: { value: 'live' },
      });
      fireEvent.change(screen.getByLabelText('Violence'), {
        target: { value: '0.55' },
      });
      fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
      fireEvent.change(fieldIn('Reply-bot intent', 'Min confidence'), {
        target: { value: '0.7' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        expect(mocks.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            isMediaPerceptionEnabled: false,
            moderationMode: 'live',
            moderationThresholds: { violence: 0.55 },
            replyBotIntentMinConfidence: 0.7,
          }),
        );
      });
    });

    it('never resends the flags edited on Admin → Flags (#5468)', async () => {
      render(<PlatformSettingsPage />);

      fireEvent.click(
        await screen.findByRole('button', { name: /save settings/i }),
      );

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalled());
      expect(mocks.updateSettings.mock.calls[0]?.[0]).not.toHaveProperty(
        'flags',
      );
    });

    it('never resends the Featured pins edited on Admin → Workflows (#5511)', async () => {
      mocks.getSettings.mockResolvedValue({
        featuredWorkflowIds: ['wf-pinned'],
        id: 'platform-settings',
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
        typedDecisionProvider: 'jev',
      });
      render(<PlatformSettingsPage />);

      fireEvent.click(
        await screen.findByRole('button', { name: /save settings/i }),
      );

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalled());
      expect(mocks.updateSettings.mock.calls[0]?.[0]).not.toHaveProperty(
        'featuredWorkflowIds',
      );
    });

    it('offers only off and shadow on a shadow-capped decision point', async () => {
      render(<PlatformSettingsPage />);

      await openTab('AI');
      const select = screen.getByTestId('platform-task-routing-mode');
      const options = Array.from(select.querySelectorAll('option')).map(
        (option) => option.getAttribute('value'),
      );
      expect(options).toEqual(['off', 'shadow']);
    });

    it('blocks saving while a switch value is invalid', async () => {
      render(<PlatformSettingsPage />);

      await openTab('AI');
      const input = fieldIn('Untrusted content', 'Min confidence');
      fireEvent.change(input, { target: { value: '1.5' } });

      expect(
        screen.getByText('Enter a number from 0 to 1'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      expect(mocks.warning).toHaveBeenCalledWith(
        'Fix the highlighted feature switch values before saving',
      );
      expect(mocks.updateSettings).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: '0.9' } });
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        expect(mocks.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ untrustedContentMinConfidence: 0.9 }),
        );
      });
    });

    it('starts system-event recording now when switched on', async () => {
      const before = Date.now();
      render(<PlatformSettingsPage />);

      await openTab('Accounts');
      fireEvent.click(
        screen.getByRole('switch', { name: /record system events/i }),
      );
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        expect(mocks.updateSettings).toHaveBeenCalled();
      });
      const [payload] = mocks.updateSettings.mock.calls[0] ?? [];
      const startedAt = Date.parse(payload?.systemEventsEnabledAt ?? '');
      expect(startedAt).toBeGreaterThanOrEqual(before);
      expect(startedAt).toBeLessThanOrEqual(Date.now());
    });

    describe('brand vision models (#6727)', () => {
      it('renders a select of the catalog models with each per-second price, defaulting to the registered rows', async () => {
        render(<PlatformSettingsPage />);

        await openTab('Media');

        const ocr = screen.getByTestId('platform-brandVisionOcrModelKey');
        expect(ocr).toHaveValue('lucataco/florence-2-large');
        expect(
          within(ocr).getByRole('option', {
            name: 'Florence-2 Large (brand OCR) · $0.000975 per second',
          }),
        ).toBeInTheDocument();
        const detect = screen.getByTestId('platform-brandVisionDetectModelKey');
        expect(detect).toHaveValue('adirik/owlvit-base-patch32');
        expect(
          within(detect).getByRole('option', {
            name: 'OWL-ViT base (brand detection) · $0.000225 per second',
          }),
        ).toBeInTheDocument();
        expect(screen.getByText('Brand OCR model')).toBeInTheDocument();
        expect(screen.getByText('Brand detection model')).toBeInTheDocument();
      });

      it('is a select, never a free-text input', async () => {
        render(<PlatformSettingsPage />);

        await openTab('Media');

        for (const id of [
          'platform-brandVisionOcrModelKey',
          'platform-brandVisionDetectModelKey',
        ]) {
          expect(screen.getByTestId(id).tagName.toLowerCase()).toBe('select');
          expect(screen.queryByRole('textbox', { name: id })).toBeNull();
        }
      });

      it('saves a cleared selection as null with the other settings', async () => {
        render(<PlatformSettingsPage />);

        await openTab('Media');
        fireEvent.change(
          screen.getByTestId('platform-brandVisionOcrModelKey'),
          {
            target: { value: '__none__' },
          },
        );
        fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

        await waitFor(() => {
          expect(mocks.updateSettings).toHaveBeenCalledWith(
            expect.objectContaining({
              brandVisionDetectModelKey: 'adirik/owlvit-base-patch32',
              brandVisionOcrModelKey: null,
              isBrandVisualAnalysisEnabled: false,
            }),
          );
        });
      });

      it('keeps a stored key that is no longer an eligible model visible as unavailable', async () => {
        mocks.getSettings.mockResolvedValue({
          brandVisionOcrModelKey: 'acme/retired-ocr',
          id: 'platform-settings',
          marginInputMode: 'MARGIN',
          marginMultiplierAgentChat: 1.7,
          marginMultiplierGeneration: 3.33,
          typedDecisionProvider: 'jev',
        });
        render(<PlatformSettingsPage />);

        await openTab('Media');

        const ocr = screen.getByTestId('platform-brandVisionOcrModelKey');
        expect(ocr).toHaveValue('acme/retired-ocr');
        expect(
          within(ocr).getByRole('option', {
            name: 'acme/retired-ocr (not an active priced catalog model)',
          }),
        ).toBeInTheDocument();
      });

      it('still renders the page when the model choices cannot be loaded', async () => {
        mocks.getBrandVisionModels.mockRejectedValue(new Error('offline'));
        render(<PlatformSettingsPage />);

        await openTab('Media');

        expect(
          screen.getByTestId('platform-brandVisionOcrModelKey'),
        ).toHaveValue('lucataco/florence-2-large');
        expect(mocks.error).toHaveBeenCalledWith(
          'Failed to load brand vision models',
          expect.any(Error),
        );
      });
    });
  });
});
