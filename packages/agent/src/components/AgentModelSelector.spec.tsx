import { AGENT_MODELS } from '@genfeedai/agent/constants/agent-models.constant';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/button', () => ({
  Button: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        disabled={props.isDisabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

vi.mock('@ui/primitives/popover', () => ({
  // Only render content when open so tests mirror closed-popover reality.
  Popover: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    <div data-popover-open={open ? 'true' : 'false'}>{children}</div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="model-selector-menu">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AgentModelSelector } from './AgentModelSelector';

describe('AgentModelSelector', () => {
  it('disables the trigger when the composer is disabled', () => {
    render(
      <AgentModelSelector
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Select model' });
    expect(trigger).toBeDisabled();
  });

  it('keeps the trigger enabled when the composer is active', () => {
    render(
      <AgentModelSelector
        creditsAvailable={null}
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Select model' }),
    ).not.toBeDisabled();
  });

  it('clears open state when the selector becomes disabled', () => {
    const { container, rerender } = render(
      <AgentModelSelector
        creditsAvailable={null}
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    // Disable while open would latch open=true without the reset effect.
    rerender(
      <AgentModelSelector
        creditsAvailable={null}
        isDisabled
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
    expect(container.querySelector('[data-popover-open="true"]')).toBeNull();

    rerender(
      <AgentModelSelector
        creditsAvailable={null}
        onModelChange={vi.fn()}
        selectedModel={AGENT_MODELS[0]?.key ?? 'auto'}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Select model' }),
    ).not.toBeDisabled();
    // Re-enable must stay closed — not restore a previous open latch.
    expect(container.querySelector('[data-popover-open="true"]')).toBeNull();
    expect(container.querySelector('[data-popover-open="false"]')).toBeTruthy();
  });
});
