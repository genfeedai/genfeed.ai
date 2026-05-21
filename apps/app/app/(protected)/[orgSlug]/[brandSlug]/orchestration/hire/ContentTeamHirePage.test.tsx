import '@testing-library/jest-dom';
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
  success: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Moonrise' },
      { id: 'brand-2', label: 'Solar' },
    ],
  }),
}));

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children?: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <aside>
      <h2>{label}</h2>
      <p>{description}</p>
      {children}
    </aside>
  ),
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

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    label,
    onClick,
    type = 'button',
  }: {
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} onClick={onClick}>
      {label}
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

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid={`select-${value}`}>
      {children}
      <button type="button" onClick={() => onValueChange?.('copywriter')}>
        choose copywriter
      </button>
      <button type="button" onClick={() => onValueChange?.('brand-2')}>
        choose brand two
      </button>
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <button id={id} type="button">
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
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

  it('renders role preview and hires a content team agent', async () => {
    render(<ContentTeamHirePage />);

    expect(screen.getByRole('heading', { name: 'Hire Agent' })).toBeVisible();
    expect(screen.getAllByText('Video Producer')[0]).toBeVisible();
    expect(screen.getByText('Creates short-form video briefs.')).toBeVisible();
    expect(screen.getByText('TikTok, YouTube Shorts')).toBeVisible();
    expect(screen.getByText('Production')).toBeVisible();
    expect(screen.getByText(/25 credits/)).toBeVisible();
    expect(screen.getByText('Moonrise')).toBeVisible();
    expect(screen.getByText('Solar')).toBeVisible();

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

    fireEvent.click(screen.getByRole('button', { name: 'Hire Agent' }));

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
    expect(mocks.success).toHaveBeenCalledWith('Agent hired successfully');
    expect(mocks.push).toHaveBeenCalledWith('/orchestration');
  });

  it('updates preview fields, cancels, and reports create failures', async () => {
    mocks.create.mockRejectedValueOnce(new Error('create failed'));
    render(<ContentTeamHirePage />);

    fireEvent.click(screen.getAllByText('choose copywriter')[0]);
    expect(screen.getByText('Writes launch copy.')).toBeVisible();
    expect(screen.getByText('Editorial')).toBeVisible();
    expect(screen.getByText(/10 credits/)).toBeVisible();

    fireEvent.click(screen.getByText('Cancel'));
    expect(mocks.push).toHaveBeenCalledWith('/orchestration');

    fireEvent.click(screen.getByRole('button', { name: 'Hire Agent' }));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to hire content team agent',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Unable to hire agent');
  });
});
