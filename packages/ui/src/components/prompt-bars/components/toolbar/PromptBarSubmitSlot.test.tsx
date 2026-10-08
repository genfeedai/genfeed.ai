import type { PromptBarSubmitSlotProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarSubmitSlot from '@ui/prompt-bars/components/toolbar/PromptBarSubmitSlot';
import { describe, expect, it, vi } from 'vitest';

function renderSlot(overrides: Partial<PromptBarSubmitSlotProps> = {}) {
  const props: PromptBarSubmitSlotProps = {
    isEmpty: true,
    isListening: false,
    isTranscribing: false,
    isVoiceAvailable: true,
    onStartListening: vi.fn(),
    onStopListening: vi.fn(),
    send: <span data-testid="send">send</span>,
    ...overrides,
  };
  render(<PromptBarSubmitSlot {...props} />);
  return props;
}

describe('PromptBarSubmitSlot', () => {
  it('gives the slot to the mic while the prompt is empty', () => {
    const props = renderSlot();

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(props.onStartListening).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('send')).not.toBeInTheDocument();
  });

  it('keeps a secondary mic beside send once there is something to submit', () => {
    renderSlot({ isEmpty: false });

    expect(
      screen.getByRole('button', { name: 'Start voice input' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('send')).toBeInTheDocument();
  });

  it('shows only send when voice is unavailable', () => {
    renderSlot({ isVoiceAvailable: false });

    expect(
      screen.queryByRole('button', { name: 'Start voice input' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('send')).toBeInTheDocument();
  });

  it('lets the active recording own the slot', () => {
    const props = renderSlot({ isEmpty: false, isListening: true });

    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(props.onStopListening).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('send')).not.toBeInTheDocument();
  });

  it('replaces the mic with Stop during a run and keeps a queued send', () => {
    const onStop = vi.fn();
    renderSlot({
      isEmpty: true,
      onStop,
      showStop: true,
      stopLabel: 'Stop agent',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'Start voice input' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('send')).toBeInTheDocument();
  });
});
