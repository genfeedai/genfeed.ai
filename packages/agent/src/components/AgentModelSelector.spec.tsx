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

    await user.click(screen.getByRole('button', { name: /auto/i }));

    expect(screen.getByLabelText('Search models')).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Models' })).toHaveClass(
      'max-h-72',
    );
    expect(screen.queryByText(/^\d+cr$/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/^Cost tier \$+$/).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Search models'), 'opus');
    expect(screen.getByRole('option', { name: /claude opus/i })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: /^auto$/i }),
    ).not.toBeInTheDocument();
  });
});
