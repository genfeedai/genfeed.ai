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
  onCreated: vi.fn(),
  success: vi.fn(),
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

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isBrandResourceReady: () => true,
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
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

vi.mock('./AgentMarketplace', () => ({
  default: ({
    onActivate,
    isSubmitting,
    submittingPresetId,
  }: {
    isSubmitting: boolean;
    onActivate: (presetId: string) => void;
    submittingPresetId: string | null;
  }) => (
    <div data-testid="agent-marketplace">
      <button
        disabled={isSubmitting}
        onClick={() => onActivate('video-producer')}
        type="button"
      >
        {submittingPresetId === 'video-producer'
          ? 'Activating Video Producer'
          : 'Activate Video Producer'}
      </button>
      <button
        disabled={isSubmitting}
        onClick={() => onActivate('copywriter')}
        type="button"
      >
        Activate Copywriter
      </button>
    </div>
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

  it('activates a preconfigured agent with preset defaults', async () => {
    render(<ContentTeamHirePage isEmbedded onCreated={mocks.onCreated} />);

    expect(screen.getByTestId('agent-marketplace')).toBeVisible();
    expect(screen.queryByLabelText('Agent Label')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Daily Budget')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shared Persona')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Activate Video Producer' }),
    );

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          builtFromPreset: true,
          isActive: true,
          rolePresetId: 'video-producer',
        }),
      );
    });
    expect(mocks.buildRoleStrategyInput).toHaveBeenCalledWith({
      brandId: 'brand-1',
      rolePresetId: 'video-producer',
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent added successfully');
    expect(mocks.onCreated).toHaveBeenCalledOnce();
  });

  it('reports activate failures without closing the marketplace', async () => {
    mocks.create.mockRejectedValueOnce(new Error('create failed'));
    render(<ContentTeamHirePage isEmbedded onCreated={mocks.onCreated} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Activate Copywriter' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to activate content team agent',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Unable to activate agent');
    expect(mocks.onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-marketplace')).toBeVisible();
  });
});
