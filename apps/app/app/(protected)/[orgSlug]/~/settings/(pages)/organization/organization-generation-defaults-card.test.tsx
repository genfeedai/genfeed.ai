import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationGenerationDefaultsCard from './organization-generation-defaults-card';

const mocks = vi.hoisted(() => ({
  getOrganizationsService: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  settings: {
    defaultImageModel: 'flux',
    defaultImageToVideoModel: 'kling',
    defaultModel: 'gpt-4o',
    defaultModelReview: 'claude-3-5',
    defaultModelUpdate: 'gpt-4o-mini',
    defaultMusicModel: 'suno',
    defaultVideoModel: 'runway',
    enabledModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5'],
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

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    imageModels: [
      { id: 'image-1', key: 'flux', label: 'Flux' },
      { id: 'image-2', key: 'seedream', label: 'Seedream' },
    ],
    musicModels: [
      { id: 'music-1', key: 'suno', label: 'Suno' },
      { id: 'music-2', key: 'udio', label: 'Udio' },
    ],
    videoModels: [
      { id: 'video-1', key: 'runway', label: 'Runway' },
      { id: 'video-2', key: 'kling', label: 'Kling' },
    ],
  }),
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

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      patchSettings: mocks.patchSettings,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
    type = 'button',
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
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
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

describe('OrganizationGenerationDefaultsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationId = 'org-1';
    mocks.settings = {
      defaultImageModel: 'flux',
      defaultImageToVideoModel: 'kling',
      defaultModel: 'gpt-4o',
      defaultModelReview: 'claude-3-5',
      defaultModelUpdate: 'gpt-4o-mini',
      defaultMusicModel: 'suno',
      defaultVideoModel: 'runway',
      enabledModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5'],
    };
    mocks.getOrganizationsService.mockResolvedValue({
      patchSettings: mocks.patchSettings,
    });
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
  });

  it('renders existing text and media generation defaults', () => {
    render(<OrganizationGenerationDefaultsCard />);

    expect(screen.getByText('Generation Defaults')).toBeInTheDocument();
    expect(screen.getByText('Text Content')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('gpt-4o');
    expect(selects[1]).toHaveValue('claude-3-5');
    expect(selects[2]).toHaveValue('gpt-4o-mini');
    expect(selects[3]).toHaveValue('flux');
    expect(selects[4]).toHaveValue('runway');
    expect(selects[5]).toHaveValue('kling');
    expect(selects[6]).toHaveValue('suno');
  });

  it('saves selected defaults and converts auto selections to null', async () => {
    render(<OrganizationGenerationDefaultsCard />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'none' } });
    fireEvent.change(selects[1], { target: { value: 'gpt-4o-mini' } });
    fireEvent.change(selects[2], { target: { value: 'claude-3-5' } });
    fireEvent.change(selects[3], { target: { value: 'seedream' } });
    fireEvent.change(selects[4], { target: { value: 'kling' } });
    fireEvent.change(selects[5], { target: { value: 'runway' } });
    fireEvent.change(selects[6], { target: { value: 'udio' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Generation Defaults' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        defaultImageModel: 'seedream',
        defaultImageToVideoModel: 'runway',
        defaultModel: null,
        defaultModelReview: 'gpt-4o-mini',
        defaultModelUpdate: 'claude-3-5',
        defaultMusicModel: 'udio',
        defaultVideoModel: 'kling',
      });
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Organization generation defaults saved',
      );
    });
  });

  it('reports missing organization context and save failures', async () => {
    mocks.organizationId = '';
    const { rerender } = render(<OrganizationGenerationDefaultsCard />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Generation Defaults' }),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Organization context is unavailable',
    );

    mocks.organizationId = 'org-1';
    mocks.patchSettings.mockRejectedValueOnce(new Error('save failed'));
    rerender(<OrganizationGenerationDefaultsCard />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Generation Defaults' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save organization generation defaults',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save organization generation defaults',
      );
    });
  });

  it('falls back to auto when settings are empty', () => {
    mocks.settings = {};

    render(<OrganizationGenerationDefaultsCard />);

    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveValue('none');
    }
  });
});
