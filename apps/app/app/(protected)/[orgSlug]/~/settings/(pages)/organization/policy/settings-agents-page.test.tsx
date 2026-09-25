import '@testing-library/jest-dom/vitest';
import { AgentAutonomyMode } from '@genfeedai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ui from '../../../../../../../../messages/en/ui.json';
import SettingsAgentsPage from './settings-agents-page';

const mocks = vi.hoisted(() => ({
  findAllPages: vi.fn(),
  modelAccess: null as {
    isLocked: boolean;
    lockedModelKey: string | null;
    lockedModelLabel: string | null;
    reason: 'free_tier' | null;
  } | null,
  modelCosts: {} as Record<string, number>,
  loggerError: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  settings: {
    agentPolicy: {
      allowAdvancedOverrides: true,
      autonomyDefault: 'auto_publish',
      creditGovernance: {
        agentDailyCreditCap: 250,
        brandDailyCreditCap: 1000,
      },
      generationModelOverride: 'google/nano-banana-2',
      qualityTierDefault: 'high_quality',
      reviewModelOverride: 'gpt-5.4-mini',
      thinkingModelOverride: 'gpt-5.5',
    },
    enabledModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'nano-id'],
  } as Record<string, unknown>,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    refresh: mocks.refresh,
    settings: mocks.settings,
  }),
}));

vi.mock(
  '@hooks/data/billing/use-agent-model-access/use-agent-model-access',
  () => ({
    useAgentModelAccess: () => ({
      isLoading: false,
      modelAccess: mocks.modelAccess,
      modelCosts: mocks.modelCosts,
    }),
  }),
);

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme${path}` }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      patchSettings: mocks.patchSettings,
    }),
  },
}));

vi.mock('@services/ai/models.service', () => ({
  ModelsService: {
    getInstance: () => ({
      findAllPages: mocks.findAllPages,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children?: ReactNode; label?: string }) => (
    <section>
      {label ? <h2>{label}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives', () => ({
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
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    type = 'text',
    value,
  }: {
    id?: string;
    onChange: (event: { target: { value: string } }) => void;
    type?: string;
    value: string;
  }) => (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event)}
    />
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    isChecked,
    isDisabled,
    label,
    onChange,
  }: {
    isChecked: boolean;
    isDisabled?: boolean;
    label: string;
    onChange: (event: { target: { checked: boolean } }) => void;
  }) => (
    <button
      type="button"
      disabled={isDisabled}
      aria-pressed={isChecked}
      onClick={() => onChange({ target: { checked: !isChecked } })}
    >
      {label}
    </button>
  ),
}));

describe('SettingsAgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.organizationId = 'org-1';
    mocks.modelAccess = null;
    mocks.modelCosts = {};
    mocks.settings = {
      agentPolicy: {
        allowAdvancedOverrides: true,
        autonomyDefault: 'auto_publish',
        creditGovernance: {
          agentDailyCreditCap: 250,
          brandDailyCreditCap: 1000,
        },
        generationModelOverride: 'google/nano-banana-2',
        qualityTierDefault: 'high_quality',
        reviewModelOverride: 'gpt-5.4-mini',
        thinkingModelOverride: 'gpt-5.5',
      },
      enabledModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'nano-id'],
    };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.findAllPages.mockResolvedValue([
      {
        category: 'text',
        id: 'gpt-5.5-id',
        key: 'gpt-5.5',
        label: 'GPT-5.5',
      },
      {
        category: 'text',
        id: 'gpt-5.4-id',
        key: 'gpt-5.4',
        label: 'GPT-5.4',
      },
      {
        category: 'text',
        id: 'gpt-5.4-mini-id',
        key: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
      },
      {
        category: 'image',
        id: 'nano-id',
        key: 'google/nano-banana-2',
        label: 'Nano Banana 2 Lite',
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <NextIntlClientProvider locale="en" messages={{ ui }}>
        <QueryClientProvider client={queryClient}>
          <SettingsAgentsPage />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
  }

  it('loads existing policy settings and patches on each control change', async () => {
    renderPage();

    expect(screen.getByText('Autonomous Agent Policy')).toBeInTheDocument();
    expect(screen.getByText('Advanced Routing')).toBeInTheDocument();
    expect(screen.queryByText('Brand-Level Profiles')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /save agent policy/i }),
    ).toBeNull();
    expect(screen.getByLabelText('Brand Daily Cap')).toHaveValue(1000);
    expect(screen.getByLabelText('Agent Daily Cap')).toHaveValue(250);

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('high_quality');
    expect(selects[1]).toHaveValue(AgentAutonomyMode.AUTO_PUBLISH);
    expect(selects[2]).toHaveValue('gpt-5.5');
    expect(selects[3]).toHaveValue('google/nano-banana-2');
    expect(selects[4]).toHaveValue('gpt-5.4-mini');

    fireEvent.change(selects[0], { target: { value: 'budget' } });

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          agentPolicy: expect.objectContaining({
            qualityTierDefault: 'budget',
          }),
        }),
      );
    });

    fireEvent.change(selects[1], {
      target: { value: AgentAutonomyMode.SUPERVISED },
    });

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          agentPolicy: expect.objectContaining({
            autonomyDefault: AgentAutonomyMode.SUPERVISED,
          }),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText('Brand Daily Cap'), {
      target: { value: '1500' },
    });
    fireEvent.change(screen.getByLabelText('Agent Daily Cap'), {
      target: { value: 'not-a-number' },
    });

    await vi.advanceTimersByTimeAsync(450);

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          agentPolicy: expect.objectContaining({
            creditGovernance: expect.objectContaining({
              agentDailyCreditCap: null,
              brandDailyCreditCap: 1500,
              useOrganizationPool: true,
            }),
          }),
        }),
      );
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('patches simple tier controls, skips missing organization, and logs failures', async () => {
    mocks.settings = {
      agentPolicy: undefined,
      enabledModelIds: ['gpt-5.5'],
    };
    const { rerender } = renderPage();

    expect(
      screen.getByText('Default routing for most teams.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Keep this off for most teams/),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Expose Raw Model Overrides' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          agentPolicy: expect.objectContaining({
            allowAdvancedOverrides: true,
          }),
        }),
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Expose Raw Model Overrides' }),
    );
    fireEvent.change(screen.getByLabelText('Brand Daily Cap'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Agent Daily Cap'), {
      target: { value: '75' },
    });

    await vi.advanceTimersByTimeAsync(450);

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          agentPolicy: expect.objectContaining({
            allowAdvancedOverrides: false,
            creditGovernance: expect.objectContaining({
              agentDailyCreditCap: 75,
              brandDailyCreditCap: null,
            }),
            generationModelOverride: null,
            reviewModelOverride: null,
            thinkingModelOverride: null,
          }),
        }),
      );
    });

    vi.clearAllMocks();
    mocks.organizationId = '';
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ui }}>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <SettingsAgentsPage />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'budget' },
    });
    expect(mocks.patchSettings).not.toHaveBeenCalled();

    mocks.organizationId = 'org-1';
    mocks.patchSettings.mockRejectedValueOnce(new Error('save failed'));
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ui }}>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <SettingsAgentsPage />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'balanced' },
    });

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to update agent policy settings',
        expect.any(Error),
      );
    });
  });

  it('shows per-message estimates on thinking model options for subscribers', async () => {
    mocks.modelCosts = { 'gpt-5.5': 3.24, 'gpt-5.4': 0.04 };
    renderPage();

    expect(
      await screen.findByRole('option', {
        name: 'GPT-5.5 · ≈ 3.2 credits / message',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'GPT-5.4 · ≈ <0.1 credits / message',
      }),
    ).toBeInTheDocument();
  });

  it('replaces the thinking model picker with the locked model and an upgrade hint on the free tier', async () => {
    mocks.modelAccess = {
      isLocked: true,
      lockedModelKey: 'deepseek/deepseek-v4-flash-0731',
      lockedModelLabel: 'DeepSeek V4 Flash',
      reason: 'free_tier',
    };
    renderPage();

    const notice = await screen.findByTestId('agent-model-lock-notice');
    expect(notice).toHaveTextContent(
      'Free plans run every agent on DeepSeek V4 Flash. Upgrade to choose any model.',
    );
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/acme/settings/subscription',
    );
    // Generation + review overrides stay; the thinking picker is gone.
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
  });
});
