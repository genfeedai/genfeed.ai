import type { AgentChatInputToolbarProps } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
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
    canUseVoiceInput: false,
    disabled: false,
    generationMode: 'auto',
    hasEditor: true,
    isEmptyComposer: true,
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

  it('labels real setup and attachment controls only inside the sidebar', async () => {
    const onInsertReference = vi.fn();
    render(
      <ConversationComposerShellProvider
        contextLabel="Library"
        draftScopeKey={null}
        placement="dock"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInputToolbar
          {...buildDefaultProps({
            isEmptyComposer: false,
            onInsertReference,
            promptText: 'Plan next week',
          })}
        />
      </ConversationComposerShellProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    ).toBeInTheDocument();
    // The saved enhancement defaults stay one click away in an icon-only
    // settings button; there is no manual Enhance action.
    expect(
      screen.queryByRole('button', { name: 'Enhance prompt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Prompt enhancement settings' }),
    ).toBeInTheDocument();
    const attach = screen.getByRole('button', { name: 'Add context' });
    expect(attach).toHaveTextContent('Reference');
    fireEvent.pointerDown(attach);
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Reference library content',
      }),
    );
    expect(onInsertReference).toHaveBeenCalledOnce();
  });

  it('keeps only Send on the right and Add context last on the left', () => {
    render(
      <ConversationComposerShellProvider
        contextLabel="Library"
        draftScopeKey={null}
        placement="dock"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatInputToolbar
          {...buildDefaultProps({
            isEmptyComposer: false,
            promptText: 'Plan next week',
          })}
        />
      </ConversationComposerShellProvider>,
    );

    const toolbar = screen.getByTestId('prompt-bar-toolbar');
    const left = toolbar.querySelector('[data-prompt-bar-leading]');
    const right = left?.nextElementSibling;
    const leftNames = Array.from(left?.querySelectorAll('button') ?? []).map(
      (button) => button.getAttribute('aria-label'),
    );
    expect(leftNames).toEqual([
      'Agent mode: Manual',
      'Prompt enhancement settings',
      'Add context',
    ]);
    expect(
      Array.from(right?.querySelectorAll('button') ?? []).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Send message']);
  });

  it('hides the agent-only controls but keeps Send for other hosts', () => {
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({
          isAgentControlsHidden: true,
          isEmptyComposer: false,
          promptText: 'Generate an image of a red apple',
        })}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Agent mode/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add context')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
  });

  it('keeps a secondary mic beside Send once the field has text', () => {
    const onStartListening = vi.fn();
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({
          canUseVoiceInput: true,
          isEmptyComposer: false,
          onStartListening,
          promptText: 'Draft a launch post',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalledOnce();
  });

  it('shows no mic beside Send when voice input is unavailable', () => {
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({
          isEmptyComposer: false,
          promptText: 'Draft a launch post',
        })}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Start voice input' }),
    ).not.toBeInTheDocument();
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
