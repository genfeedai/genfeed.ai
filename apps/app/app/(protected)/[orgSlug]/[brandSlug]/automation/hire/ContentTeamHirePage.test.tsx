import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentTeamHirePage from './ContentTeamHirePage';

const mocks = vi.hoisted(() => ({
  buildRoleStrategyInput: vi.fn((input: Record<string, unknown>) => ({
    builtFromPreset: true,
    ...input,
  })),
  create: vi.fn(),
  error: vi.fn(),
  getStrategiesService: vi.fn(),
  loggerError: vi.fn(),
  push: vi.fn(),
  onCancel: vi.fn(),
  onCreated: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    selectedBrand: { id: 'brand-1', label: 'Moonrise' },
  }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getStrategiesService,
}));

vi.mock('@pages/agents/content-team/content-team-presets', () => ({
  CONTENT_TEAM_ROLE_PRESETS: [
    {
      defaultBudget: 25,
      defaultLabel: 'Video Producer',
      description: 'Creates short-form video briefs.',
      displayRole: 'Video Producer',
      id: 'video-producer',
      platforms: ['TikTok', 'YouTube Shorts'],
      teamGroup: 'Production',
      type: 'video_creator',
    },
    {
      defaultBudget: 10,
      defaultLabel: 'Copywriter',
      description: 'Writes launch copy.',
      displayRole: 'Copywriter',
      id: 'copywriter',
      platforms: ['LinkedIn'],
      teamGroup: 'Editorial',
      type: 'article_writer',
    },
  ],
  buildRoleStrategyInput: mocks.buildRoleStrategyInput,
}));

vi.mock('@services/automation/agent-strategies.service', () => ({
  AgentStrategiesService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme-org/acme-creator${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children?: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <main>
      <h1>{label}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('../agents/AgentOptionPicker', () => ({
  default: ({
    onValueChange,
    options,
    value,
  }: {
    onValueChange: (value: string) => void;
    options: Array<{
      description: string;
      label: string;
      meta: string;
      value: string;
    }>;
    value: string;
  }) => {
    const selected = options.find((option) => option.value === value);

    return (
      <div>
        <p>{selected?.description}</p>
        <p>{selected?.meta}</p>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={isDisabled} type={type} onClick={onClick}>
      {children ?? label}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

describe('ContentTeamHirePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'strategy-1' });
    mocks.getStrategiesService.mockResolvedValue({
      create: mocks.create,
    });
  });

  it('renders the selected template and hires a content team agent', async () => {
    render(
      <ContentTeamHirePage
        isEmbedded
        onCancel={mocks.onCancel}
        onCreated={mocks.onCreated}
      />,
    );

    expect(screen.getAllByText('Video Producer')[0]).toBeVisible();
    expect(screen.getByText('Creates short-form video briefs.')).toBeVisible();
    expect(screen.getByPlaceholderText('Production')).toBeVisible();
    expect(screen.getByText(/25 credits/)).toBeVisible();
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Agent Label'), {
      target: { value: 'Launch Video Producer' },
    });
    fireEvent.change(screen.getByLabelText('Daily Budget'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('Reports To'), {
      target: { value: 'Strategy Lead' },
    });
    fireEvent.change(screen.getByLabelText('Team Group'), {
      target: { value: 'Growth' },
    });
    fireEvent.change(screen.getByLabelText('Shared Persona'), {
      target: { value: 'Direct, practical founder voice' },
    });
    fireEvent.change(screen.getByLabelText('Primary Topic'), {
      target: { value: 'AI video launches' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          budget: 42,
          builtFromPreset: true,
          isActive: true,
          label: 'Launch Video Producer',
          persona: 'Direct, practical founder voice',
          reportsToLabel: 'Strategy Lead',
          rolePresetId: 'video-producer',
          sharedTopic: 'AI video launches',
          teamGroup: 'Growth',
        }),
      );
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent added successfully');
    expect(mocks.onCreated).toHaveBeenCalledOnce();
  });

  it('updates preview fields, cancels, and reports create failures', async () => {
    mocks.create.mockRejectedValueOnce(new Error('create failed'));
    render(
      <ContentTeamHirePage
        isEmbedded
        onCancel={mocks.onCancel}
        onCreated={mocks.onCreated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Copywriter/i }));
    expect(screen.getByText('Writes launch copy.')).toBeVisible();
    expect(screen.getByPlaceholderText('Editorial')).toBeVisible();
    expect(screen.getByText(/10 credits/)).toBeVisible();

    fireEvent.click(screen.getByText('Cancel'));
    expect(mocks.onCancel).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to hire content team agent',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Unable to hire agent');
  });
});
