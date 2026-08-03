import { AGENT_MODELS } from '@genfeedai/agent/constants/agent-models.constant';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentModelSelector } from './AgentModelSelector';

describe('AgentModelSelector', () => {
  it('opens with search, caps list height, and shows $ cost tiers', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <AgentModelSelector
        selectedModel={AGENT_MODELS[0]?.key ?? 'openrouter/auto'}
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
        selectedModel={AGENT_MODELS[0]?.key ?? 'openrouter/auto'}
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
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
  });

  it('clears open state when the selector becomes disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentModelSelector
        creditsAvailable={null}
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByLabelText('Search models')).toBeInTheDocument();

    rerender(
      <AgentModelSelector
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
    expect(screen.queryByLabelText('Search models')).not.toBeInTheDocument();
  });

  it('renders an override model catalog (generation modes)', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <AgentModelSelector
        creditsAvailable={null}
        models={[
          {
            brandSlug: 'auto',
            description: 'Router picks',
            key: '__auto_model__',
            label: 'Auto',
          },
          {
            brandSlug: 'replicate',
            description: 'Image generator',
            key: 'replicate/flux',
            label: 'Flux',
          },
        ]}
        onModelChange={onModelChange}
        selectedModel="__auto_model__"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Select model' }),
    ).toHaveTextContent('Auto');

    await user.click(screen.getByRole('button', { name: 'Select model' }));
    await user.click(screen.getByRole('button', { name: /flux/i }));
    expect(onModelChange).toHaveBeenCalledWith('replicate/flux');
  });
});
