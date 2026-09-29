import type { AgentChatInputToolbarProps } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentThreadMode } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(
      screen.queryByLabelText('Open workspace shortcuts'),
    ).not.toBeInTheDocument();

    // No Type/Agent-pick/Brand-voice/Prompt-enhance controls survive.
    expect(
      screen.queryByTestId('generation-setup-popover'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Lock /)).not.toBeInTheDocument();
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
});
