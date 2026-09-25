import type { IAgentBrandContextSnapshot } from '@genfeedai/contracts/interfaces';
import type { AgentContextPageState } from '@props/settings/agent-context.props';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsAgentContextPage from './content';

const { archiveMock, previewMock, refreshMock, state } = vi.hoisted(() => ({
  archiveMock: vi.fn().mockResolvedValue(undefined),
  previewMock: vi.fn(),
  refreshMock: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <main>
      {label ? <h1>{label}</h1> : null}
      {children}
    </main>
  ),
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div role="status">Loading</div>,
}));

vi.mock('./use-agent-context-page', () => ({
  useAgentContextPage: () => state.current,
}));

const SNAPSHOT: IAgentBrandContextSnapshot = {
  brandId: 'brand-1',
  brandName: 'Acme',
  budget: {
    capChars: 6000,
    isTrimmed: true,
    trimmedSections: [
      {
        header: '## Recent Posts (avoid repetition)',
        isDropped: false,
        keptChars: 40,
        originalChars: 900,
      },
    ],
    untrimmedChars: 6860,
    usedChars: 6000,
  },
  generatedAt: '2026-09-25T10:00:00.000Z',
  id: 'brand-1',
  layerStatus: [
    {
      editTarget: 'profile',
      isEmpty: false,
      isInjected: true,
      key: 'identity',
    },
    { editTarget: 'voice', isEmpty: true, isInjected: false, key: 'voice' },
    { editTarget: 'voice', isEmpty: false, isInjected: true, key: 'strategy' },
    {
      editTarget: 'voice',
      isEmpty: false,
      isInjected: false,
      key: 'prompting',
    },
    { editTarget: 'memory', isEmpty: false, isInjected: true, key: 'memories' },
  ],
  layers: {
    identity: { description: 'Systems for founders', name: 'Acme' },
    knowledge: [],
    patterns: [],
    performanceInsights: [],
    prompting: {
      conversationStarters: [
        {
          id: 'starter-1',
          intent: 'create',
          label: 'Launch post',
          prompt: 'Draft a launch post',
          topic: 'launches',
        },
      ],
      seeds: [],
    },
    recentPosts: [],
    strategy: {
      contentTypes: [],
      goals: ['awareness'],
      platforms: ['linkedin'],
      topics: ['ops'],
    },
  },
  layersUsed: ['brandIdentity'],
  memories: [
    {
      id: 'memory-1',
      isOwnedByRequester: true,
      kind: 'preference',
      scope: 'personal',
      score: 4.2,
      summary: 'Prefers short hooks',
    },
  ],
  memoryPrompt: 'Saved memory to consider',
  model: { creditsPerRound: 3, key: 'model-a', label: 'Model A' },
  query: '',
  skills: [],
  systemPrompt: 'SYSTEM PROMPT TEXT ## Brand: Acme',
};

function pageState(
  overrides: Partial<AgentContextPageState> = {},
): AgentContextPageState & { brandId: string; isReady: boolean } {
  return {
    archivePersonalMemory: archiveMock,
    brandId: 'brand-1',
    brandMemories: [],
    insights: [
      {
        category: 'timing',
        confidence: 0.8,
        id: 'brand-1:insight:0',
        insight: 'Evenings win',
      },
    ],
    isInsightsError: false,
    isLoadError: false,
    isMemoriesError: false,
    isReady: true,
    isRefreshing: false,
    pendingMemoryId: null,
    personalMemories: [
      { id: 'memory-1', scope: 'personal', summary: 'Prefers short hooks' },
    ],
    preview: previewMock,
    refresh: refreshMock,
    snapshot: SNAPSHOT,
    ...overrides,
  };
}

describe('BrandSettingsAgentContextPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.current = pageState();
  });

  it('shows each layer with its status, edit link, and empty-state nudge', () => {
    render(<BrandSettingsAgentContextPage />);

    expect(
      screen.getByRole('heading', { name: 'Agent context' }),
    ).toBeInTheDocument();
    const identity = screen.getByTestId('agent-context-layer-identity');
    expect(within(identity).getByText('In prompt')).toBeInTheDocument();
    expect(within(identity).getByText('Systems for founders')).toBeVisible();

    const voice = screen.getByTestId('agent-context-layer-voice');
    expect(
      within(voice).getByText(
        'No voice yet. Run /interview or open Brand voice.',
      ),
    ).toBeInTheDocument();
    expect(
      within(voice).getByRole('link', { name: 'Open Brand voice' }),
    ).toHaveAttribute('href', '/acme/brand/settings/voice');
    expect(
      within(voice).getByRole('link', { name: 'Run interview' }),
    ).toHaveAttribute('href', '/acme/brand/settings/interview');

    const prompting = screen.getByTestId('agent-context-layer-prompting');
    expect(
      within(prompting).getByText('Stored, not in prompt'),
    ).toBeInTheDocument();
    expect(within(prompting).getByText('Launch post')).toBeInTheDocument();
  });

  it('shows the model, credits per round, budget usage, and insights', () => {
    render(<BrandSettingsAgentContextPage />);

    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('3 credits per round')).toBeInTheDocument();
    expect(screen.getByText('6000 of 6000 characters')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Recent Posts (avoid repetition): kept 40 of 900 characters',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Evenings win')).toBeInTheDocument();
  });

  it('archives an owned personal memory and previews a query', async () => {
    const user = userEvent.setup();
    render(<BrandSettingsAgentContextPage />);

    const [archiveButton] = screen.getAllByRole('button', { name: 'Archive' });
    await user.click(archiveButton);
    expect(archiveMock).toHaveBeenCalledWith('memory-1');

    await user.type(
      screen.getByRole('textbox', { name: 'Preview a message' }),
      'launch week{Enter}',
    );
    expect(previewMock).toHaveBeenCalledWith('launch week');
  });

  it('reveals the raw prompt on demand', async () => {
    const user = userEvent.setup();
    render(<BrandSettingsAgentContextPage />);

    expect(
      screen.queryByText('SYSTEM PROMPT TEXT ## Brand: Acme'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show raw prompt' }));
    expect(
      screen.getByText('SYSTEM PROMPT TEXT ## Brand: Acme'),
    ).toBeInTheDocument();
  });

  it('offers a retry when the snapshot fails to load', async () => {
    const user = userEvent.setup();
    state.current = pageState({ isLoadError: true, snapshot: null });
    render(<BrandSettingsAgentContextPage />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refreshMock).toHaveBeenCalledOnce();
  });
});
