import { AgentStrategyConfig } from '@genfeedai/agent/components/AgentStrategyConfig';
import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    dailyCreditBudget: 100,
    engagementKeywords: ['launch'],
    engagementTone: 'friendly',
    id: 's-1',
    isActive: true,
    isEnabled: true,
    isEngagementEnabled: false,
    label: 'Weekly lifestyle',
    maxEngagementsPerDay: 20,
    platforms: ['instagram'],
    postsPerWeek: 10,
    runFrequency: 'daily',
    timezone: 'America/New_York',
    topics: ['fitness'],
    voice: 'warm',
    weeklyCreditBudget: 500,
    ...overrides,
  } as AgentStrategy;
}

interface ApiOverrides {
  createStrategy?: ReturnType<typeof vi.fn>;
  getStrategies?: ReturnType<typeof vi.fn>;
  toggleStrategy?: ReturnType<typeof vi.fn>;
  updateStrategy?: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: ApiOverrides = {}): AgentStrategyApiService {
  return {
    createStrategy: vi
      .fn()
      .mockResolvedValue(makeStrategy({ id: 'created-1' })),
    getStrategies: vi.fn().mockResolvedValue([makeStrategy()]),
    toggleStrategy: vi
      .fn()
      .mockResolvedValue(makeStrategy({ isActive: false })),
    updateStrategy: vi
      .fn()
      .mockResolvedValue(makeStrategy({ label: 'Updated' })),
    ...overrides,
  } as unknown as AgentStrategyApiService;
}

async function renderConfig(api: AgentStrategyApiService) {
  const view = render(<AgentStrategyConfig apiService={api} />);
  await waitFor(() => {
    expect(screen.getByText('Autopilot Configuration')).toBeInTheDocument();
  });
  return view;
}

describe('AgentStrategyConfig', () => {
  beforeEach(() => {
    useAgentStrategyStore.setState(
      useAgentStrategyStore.getInitialState(),
      true,
    );
  });

  it('loads the first strategy and populates every section', async () => {
    await renderConfig(makeApi());

    expect(screen.getByDisplayValue('Weekly lifestyle')).toBeInTheDocument();
    expect(screen.getByDisplayValue('warm')).toBeInTheDocument();
    expect(screen.getByText('fitness')).toBeInTheDocument();
    expect(screen.getByText('Content Strategy')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Engagement')).toBeInTheDocument();
    expect(useAgentStrategyStore.getState().strategy?.id).toBe('s-1');
  });

  it('records a load failure in the store', async () => {
    render(
      <AgentStrategyConfig
        apiService={makeApi({
          getStrategies: vi.fn().mockRejectedValue(new Error('boom')),
        })}
      />,
    );

    await waitFor(() => {
      expect(useAgentStrategyStore.getState().error).toBe('boom');
    });
  });

  it('leaves the form empty when no strategy exists', async () => {
    await renderConfig(
      makeApi({ getStrategies: vi.fn().mockResolvedValue([]) }),
    );

    expect(
      screen.getByRole('button', { name: 'Create Strategy' }),
    ).toBeDisabled();
  });

  it('adds a topic, ignores duplicates and removes it again', async () => {
    await renderConfig(makeApi());

    const topicInput = screen.getByPlaceholderText('Add a topic...');

    fireEvent.change(topicInput, { target: { value: 'travel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('travel')).toBeInTheDocument();

    // A duplicate must not create a second chip.
    fireEvent.change(topicInput, { target: { value: 'travel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('travel')).toHaveLength(1);

    // Blank input is ignored.
    fireEvent.change(topicInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('travel')).toHaveLength(1);
  });

  it('adds a topic on Enter', async () => {
    await renderConfig(makeApi());

    const topicInput = screen.getByPlaceholderText('Add a topic...');
    fireEvent.change(topicInput, { target: { value: 'cooking' } });
    fireEvent.keyDown(topicInput, { key: 'Enter' });

    expect(screen.getByText('cooking')).toBeInTheDocument();
  });

  it('toggles a platform on and off', async () => {
    await renderConfig(makeApi());

    const twitter = screen.getByRole('button', { name: 'twitter' });

    expect(twitter.className).toContain('border-border');
    fireEvent.click(twitter);
    expect(screen.getByRole('button', { name: 'twitter' }).className).toContain(
      'border-primary',
    );

    fireEvent.click(screen.getByRole('button', { name: 'twitter' }));
    expect(screen.getByRole('button', { name: 'twitter' }).className).toContain(
      'border-border',
    );
  });

  it('expands the engagement section and manages keywords', async () => {
    const { container } = await renderConfig(makeApi());

    expect(
      screen.queryByPlaceholderText('Add a keyword...'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Engagement'));

    // Keywords stay hidden until engagement itself is switched on.
    expect(
      screen.queryByPlaceholderText('Add a keyword...'),
    ).not.toBeInTheDocument();

    const toggles = container.querySelectorAll('.h-5.w-9');
    fireEvent.click(toggles[toggles.length - 1] as HTMLElement);

    const keywordInput = screen.getByPlaceholderText('Add a keyword...');
    fireEvent.change(keywordInput, { target: { value: 'sale' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });

    expect(screen.getByText('sale')).toBeInTheDocument();
    // The strategy's preloaded keyword is still listed.
    expect(screen.getByText('launch')).toBeInTheDocument();
  });

  it('updates an existing strategy on save', async () => {
    const updateStrategy = vi
      .fn()
      .mockResolvedValue(makeStrategy({ label: 'Updated' }));
    await renderConfig(makeApi({ updateStrategy }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateStrategy).toHaveBeenCalled();
    });
    expect(updateStrategy.mock.calls[0]?.[0]).toBe('s-1');
    expect(updateStrategy.mock.calls[0]?.[1]).toMatchObject({
      label: 'Weekly lifestyle',
      platforms: ['instagram'],
      topics: ['fitness'],
    });
  });

  it('creates a strategy when none is loaded', async () => {
    const createStrategy = vi
      .fn()
      .mockResolvedValue(makeStrategy({ id: 'created-1' }));
    await renderConfig(
      makeApi({
        createStrategy,
        getStrategies: vi.fn().mockResolvedValue([]),
      }),
    );

    fireEvent.change(
      screen.getByPlaceholderText('e.g. Weekly lifestyle content'),
      {
        target: { value: 'Fresh plan' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Strategy' }));

    await waitFor(() => {
      expect(createStrategy).toHaveBeenCalled();
    });
    expect(createStrategy.mock.calls[0]?.[0]).toMatchObject({
      label: 'Fresh plan',
    });
  });

  it('records a save failure in the store', async () => {
    await renderConfig(
      makeApi({
        updateStrategy: vi.fn().mockRejectedValue(new Error('save failed')),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(useAgentStrategyStore.getState().error).toBe('save failed');
    });
  });

  it('toggles the strategy active state from the header', async () => {
    const toggleStrategy = vi
      .fn()
      .mockResolvedValue(makeStrategy({ isActive: false }));
    const { container } = await renderConfig(makeApi({ toggleStrategy }));

    const toggle = container.querySelector('.h-5.w-9') as HTMLElement;
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggleStrategy).toHaveBeenCalledWith('s-1', expect.anything());
    });
    await waitFor(() => {
      expect(useAgentStrategyStore.getState().strategy?.isActive).toBe(false);
    });
  });

  it('edits the schedule and budget fields', async () => {
    await renderConfig(makeApi());

    const postsPerWeek = screen.getByLabelText(/Posts \/ Week/i);
    fireEvent.change(postsPerWeek, { target: { value: '25' } });
    expect(postsPerWeek).toHaveValue(25);

    const dailyBudget = screen.getByLabelText(/Daily Credit Budget/i);
    fireEvent.change(dailyBudget, { target: { value: '300' } });
    expect(dailyBudget).toHaveValue(300);
  });
});
