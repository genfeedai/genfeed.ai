import '@testing-library/jest-dom/vitest';
import { AgentAutonomyMode } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAgentsPage from './settings-agents-page';

const mocks = vi.hoisted(() => ({
  getOrganizationsService: vi.fn(),
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
      generationModelOverride: 'gpt-5.4',
      qualityTierDefault: 'high_quality',
      reviewModelOverride: 'gpt-5.4-mini',
      thinkingModelOverride: 'gpt-5.5',
    },
    enabledModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
  } as Record<string, unknown>,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getOrganizationsService,
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    refresh: mocks.refresh,
    settings: mocks.settings,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
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

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    isDisabled,
    label,
    onClick,
  }: {
    isDisabled?: boolean;
    label: ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onClick}>
      {label}
    </button>
  ),
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
    mocks.organizationId = 'org-1';
    mocks.settings = {
      agentPolicy: {
        allowAdvancedOverrides: true,
        autonomyDefault: 'auto_publish',
        creditGovernance: {
          agentDailyCreditCap: 250,
          brandDailyCreditCap: 1000,
        },
        generationModelOverride: 'gpt-5.4',
        qualityTierDefault: 'high_quality',
        reviewModelOverride: 'gpt-5.4-mini',
        thinkingModelOverride: 'gpt-5.5',
      },
      enabledModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
    };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.getOrganizationsService.mockResolvedValue({
      patchSettings: mocks.patchSettings,
    });
  });

  it('loads existing policy settings and saves advanced routing overrides', async () => {
    render(<SettingsAgentsPage />);

    expect(screen.getByText('Autonomous Agent Policy')).toBeInTheDocument();
    expect(screen.getByText('Advanced Routing')).toBeInTheDocument();
    expect(screen.getByText('Brand-Level Profiles')).toBeInTheDocument();
    expect(screen.getByLabelText('Brand Daily Cap')).toHaveValue(1000);
    expect(screen.getByLabelText('Agent Daily Cap')).toHaveValue(250);

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('high_quality');
    expect(selects[1]).toHaveValue(AgentAutonomyMode.AUTO_PUBLISH);
    expect(selects[2]).toHaveValue('gpt-5.5');
    expect(selects[3]).toHaveValue('gpt-5.4');
    expect(selects[4]).toHaveValue('gpt-5.4-mini');

    fireEvent.change(selects[0], { target: { value: 'budget' } });
    fireEvent.change(selects[1], {
      target: { value: AgentAutonomyMode.SUPERVISED },
    });
    fireEvent.change(selects[2], { target: { value: '__auto__' } });
    fireEvent.change(selects[3], { target: { value: 'gpt-5.5' } });
    fireEvent.change(selects[4], { target: { value: 'gpt-5.4' } });
    fireEvent.change(screen.getByLabelText('Brand Daily Cap'), {
      target: { value: '1500' },
    });
    fireEvent.change(screen.getByLabelText('Agent Daily Cap'), {
      target: { value: 'not-a-number' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent Policy' }));

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        agentPolicy: {
          allowAdvancedOverrides: true,
          autonomyDefault: AgentAutonomyMode.SUPERVISED,
          creditGovernance: {
            agentDailyCreditCap: null,
            brandDailyCreditCap: 1500,
            useOrganizationPool: true,
          },
          generationModelOverride: 'gpt-5.5',
          qualityTierDefault: 'budget',
          reviewModelOverride: 'gpt-5.4',
          thinkingModelOverride: null,
        },
      });
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('saves simple tier controls, skips missing organization, and logs failures', async () => {
    mocks.settings = {
      agentPolicy: undefined,
      enabledModels: ['gpt-5.5'],
    };
    const { rerender } = render(<SettingsAgentsPage />);

    expect(
      screen.getByText('Default routing for most teams.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Keep this off for most teams/),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Expose Raw Model Overrides' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Expose Raw Model Overrides' }),
    );
    fireEvent.change(screen.getByLabelText('Brand Daily Cap'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Agent Daily Cap'), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent Policy' }));

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
    rerender(<SettingsAgentsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent Policy' }));
    expect(mocks.patchSettings).not.toHaveBeenCalled();

    mocks.organizationId = 'org-1';
    mocks.patchSettings.mockRejectedValueOnce(new Error('save failed'));
    rerender(<SettingsAgentsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Agent Policy' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to update agent policy settings',
        expect.any(Error),
      );
    });
  });
});
