import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  type ButtonHTMLAttributes,
  Children,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformSettingsPage from './platform-settings-page';

// Flags are edited on Admin → Flags (#5468); the settings page never resends them.
const { flags: _flags, ...SAVED_SWITCHES } = DEFAULT_PLATFORM_FEATURE_SETTINGS;

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

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
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

describe('PlatformSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const select = await screen.findByTestId(
      'platform-typed-decision-provider',
    );
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

    await screen.findByTestId('platform-typed-decision-provider');
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

      expect(
        await screen.findByRole('switch', { name: /media perception/i }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('switch', { name: /require email verification/i }),
      ).toBeChecked();
      expect(screen.getByTestId('platform-moderation-mode')).toHaveValue(
        'live',
      );
      expect(screen.getByLabelText('Sexual')).toHaveValue(0.4);
      expect(screen.getByLabelText('Violence')).toHaveValue(null);
      expect(
        screen.getByLabelText('Task routing minimum confidence'),
      ).toHaveValue(0.9);
      expect(
        screen.getByText('Recording since 2026-09-20T10:00:00.000Z'),
      ).toBeInTheDocument();
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

      const toggle = await screen.findByRole('switch', {
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

      const toggle = await screen.findByRole('switch', {
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

      const toggle = await screen.findByRole('switch', {
        name: /require email verification/i,
      });
      expect(toggle).toBeEnabled();
      expect(screen.queryByText(/RESEND_API_KEY/)).not.toBeInTheDocument();
    });

    it('saves edited switches with the rest of the settings', async () => {
      render(<PlatformSettingsPage />);

      fireEvent.click(
        await screen.findByRole('switch', { name: /media perception/i }),
      );
      fireEvent.change(screen.getByTestId('platform-moderation-mode'), {
        target: { value: 'live' },
      });
      fireEvent.change(screen.getByLabelText('Violence'), {
        target: { value: '0.55' },
      });
      fireEvent.change(
        screen.getByLabelText('Reply-bot intent minimum confidence'),
        { target: { value: '0.7' } },
      );
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

    it('offers only off and shadow on a shadow-capped decision point', async () => {
      render(<PlatformSettingsPage />);

      const select = await screen.findByTestId('platform-task-routing-mode');
      const options = Array.from(select.querySelectorAll('option')).map(
        (option) => option.getAttribute('value'),
      );
      expect(options).toEqual(['off', 'shadow']);
    });

    it('blocks saving while a switch value is invalid', async () => {
      render(<PlatformSettingsPage />);

      const input = await screen.findByLabelText(
        'Untrusted-content minimum confidence',
      );
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

      fireEvent.click(
        await screen.findByRole('switch', { name: /record system events/i }),
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
  });
});
