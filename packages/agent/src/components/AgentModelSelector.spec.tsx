import type { AgentModelOption } from '@genfeedai/agent/constants/agent-models.constant';
import { CostTier } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentModelSelector } from './AgentModelSelector';

const FIXTURE_MODELS: AgentModelOption[] = [
  {
    brandSlug: 'openai',
    costTier: CostTier.MEDIUM,
    creditCost: 4,
    description: 'Balanced',
    key: 'openai/gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
  },
  {
    brandSlug: 'anthropic',
    costTier: CostTier.HIGH,
    creditCost: 12,
    description: 'Most capable',
    isReasoning: true,
    key: 'anthropic/claude-opus-5',
    label: 'Claude Opus 5',
  },
];

describe('AgentModelSelector', () => {
  it('opens with search, caps list height, and shows $ cost tiers', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <AgentModelSelector
        models={FIXTURE_MODELS}
        selectedModel={FIXTURE_MODELS[0]?.key ?? 'openai/gpt-5.6-terra'}
        onModelChange={onModelChange}
        creditsAvailable={100}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByLabelText('Search models')).toBeInTheDocument();
    const modelGroup = screen.getByRole('group', { name: 'Models' });
    expect(modelGroup).toHaveClass('max-h-72');
    expect(screen.queryByText(/^\d+cr$/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/^Cost tier \$+$/).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Search models'), 'opus');
    expect(screen.getByRole('button', { name: /claude opus/i })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^auto$/i }),
    ).not.toBeInTheDocument();
  });

  it('clears search when Buy Credits closes the popover', async () => {
    const user = userEvent.setup();
    const onBuyCredits = vi.fn();
    // Force locked models so Buy Credits is visible.
    render(
      <AgentModelSelector
        models={FIXTURE_MODELS}
        selectedModel={FIXTURE_MODELS[0]?.key ?? 'openai/gpt-5.6-terra'}
        onModelChange={vi.fn()}
        creditsAvailable={0}
        onBuyCredits={onBuyCredits}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    await user.type(screen.getByLabelText('Search models'), 'opus');
    expect(screen.getByLabelText('Search models')).toHaveValue('opus');

    await user.click(screen.getByRole('button', { name: /buy credits/i }));
    expect(onBuyCredits).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByLabelText('Search models')).toHaveValue('');
  });

  it('disables the trigger when isDisabled is set', () => {
    render(
      <AgentModelSelector
        models={FIXTURE_MODELS}
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={FIXTURE_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
  });

  it('clears open state when the selector becomes disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentModelSelector
        models={FIXTURE_MODELS}
        creditsAvailable={null}
        onModelChange={vi.fn()}
        selectedModel={FIXTURE_MODELS[0]?.key ?? 'auto'}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByLabelText('Search models')).toBeInTheDocument();

    rerender(
      <AgentModelSelector
        models={FIXTURE_MODELS}
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={FIXTURE_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
    expect(screen.queryByLabelText('Search models')).not.toBeInTheDocument();
  });

  it('renders an override model catalog (generation modes)', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    // Fixture ids only — avoid `key: 'provider/model'` literals (gitleaks FP).
    const autoModelId = ['__auto', 'model__'].join('_');
    const fluxModelId = ['replicate', 'flux'].join('/');

    render(
      <AgentModelSelector
        creditsAvailable={null}
        models={[
          {
            brandSlug: 'auto',
            description: 'Router picks',
            key: autoModelId,
            label: 'Auto',
          },
          {
            brandSlug: 'replicate',
            description: 'Image generator',
            key: fluxModelId,
            label: 'Flux',
          },
        ]}
        onModelChange={onModelChange}
        selectedModel={autoModelId}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Select model' }),
    ).toHaveTextContent('Auto');

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    await user.click(screen.getByRole('button', { name: /flux/i }));
    expect(onModelChange).toHaveBeenCalledWith(fluxModelId);
  });
});
