import type { AgentChatInputToolbarProps } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentThreadMode } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDefaultProps(
  overrides: Partial<AgentChatInputToolbarProps> = {},
): AgentChatInputToolbarProps {
  return {
    agentMode: AgentThreadMode.MANUAL,
    canSendMessage: true,
    disabled: false,
    generationMode: 'auto',
    hasEditor: true,
    isListening: false,
    isTranscribing: false,
    isUploading: false,
    onAgentModeChange: vi.fn(),
    onGenerationModeChange: vi.fn(),
    onInsertReference: vi.fn(),
    onSelectAction: vi.fn(),
    onSend: vi.fn(),
    onStartListening: vi.fn(),
    onStop: undefined,
    onStopListening: vi.fn(),
    promptText: '',
    shouldShowSendButton: true,
    shouldShowVoiceInput: false,
    showStop: false,
    ...overrides,
  };
}

describe('AgentChatInputToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the mode dropdown plus attach/context and actions as setup UI', () => {
    render(<AgentChatInputToolbar {...buildDefaultProps()} />);

    expect(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Add context')).toBeTruthy();
    expect(screen.getByLabelText('Open workspace shortcuts')).toBeTruthy();

    // No Type/Agent-pick/Brand-voice/Prompt-enhance controls survive.
    expect(
      screen.queryByTestId('generation-setup-popover'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Lock /)).not.toBeInTheDocument();
  });

  it('reflects the active thread mode on the trigger', () => {
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({ agentMode: AgentThreadMode.PLAN })}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Agent mode: Plan' }),
    ).toBeTruthy();
  });

  it('calls onAgentModeChange with the selected mode', async () => {
    const onAgentModeChange = vi.fn();
    render(
      <AgentChatInputToolbar {...buildDefaultProps({ onAgentModeChange })} />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    );

    const autoItem = await screen.findByRole('menuitemradio', {
      name: /^Auto/,
    });
    fireEvent.click(autoItem);

    expect(onAgentModeChange).toHaveBeenCalledWith(AgentThreadMode.AUTO);
  });

  it('offers exactly Auto, Manual and Plan', async () => {
    render(<AgentChatInputToolbar {...buildDefaultProps()} />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    );

    expect(
      await screen.findByRole('menuitemradio', { name: /^Auto/ }),
    ).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /^Manual/ })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /^Plan/ })).toBeTruthy();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    const onAgentModeChange = vi.fn();
    render(
      <AgentChatInputToolbar {...buildDefaultProps({ onAgentModeChange })} />,
    );

    const trigger = screen.getByRole('button', { name: 'Agent mode: Manual' });
    trigger.focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('menuitemradio', { name: /^Plan/ });
    // Radix type-ahead: typing an item's leading text jumps focus to it.
    await user.keyboard('Plan');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onAgentModeChange).toHaveBeenCalledWith(AgentThreadMode.PLAN);
    });
  });

  it('promotes Auto to image when the prompt is a generate request', async () => {
    const onGenerationModeChange = vi.fn();
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({
          onGenerationModeChange,
          promptText: 'Generate an image of a red apple',
        })}
      />,
    );

    await waitFor(() => {
      expect(onGenerationModeChange).toHaveBeenLastCalledWith('image');
    });
  });

  it('keeps unlocked Auto for conversational prompts', async () => {
    const onGenerationModeChange = vi.fn();
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({
          onGenerationModeChange,
          promptText: "what's my brand voice?",
        })}
      />,
    );

    await waitFor(() => {
      expect(onGenerationModeChange).toHaveBeenLastCalledWith('auto');
    });
  });
});
