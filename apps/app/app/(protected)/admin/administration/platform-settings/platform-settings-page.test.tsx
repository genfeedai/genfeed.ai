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

/**
 * Native selects stand in for the Radix ones: this suite is about the page's
 * load/save wiring, and Radix's portalled listbox needs a pointer environment
 * jsdom does not provide. The page renders two Selects (margin input mode,
 * typed-decision provider), so the mock reads each one's `data-testid` off
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
});
