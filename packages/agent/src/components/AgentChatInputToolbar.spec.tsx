import type { AgentChatInputToolbarProps } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { AgentGenerationMode } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDefaultProps(
  overrides: Partial<AgentChatInputToolbarProps> = {},
): AgentChatInputToolbarProps {
  return {
    canSendMessage: true,
    canUseVoiceInput: false,
    disabled: false,
    generationMode: AgentGenerationMode.AUTO,
    hasEditor: true,
    isEmptyComposer: true,
    isListening: false,
    isTranscribing: false,
    isUploading: false,
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

  it('renders only attach/context and actions as setup UI', () => {
    render(<AgentChatInputToolbar {...buildDefaultProps()} />);

    expect(screen.getByLabelText('Add context')).toBeTruthy();
    expect(
      screen.queryByLabelText('Open workspace shortcuts'),
    ).not.toBeInTheDocument();

    // Approvals follow the organization and brand settings: the bar holds no
    // Agent mode picker and no prompt-enhancement popover.
    expect(
      screen.queryByRole('button', { name: /Agent mode/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Prompt enhancement settings' }),
    ).not.toBeInTheDocument();
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
      screen.queryByRole('button', { name: 'Enhance prompt' }),
    ).not.toBeInTheDocument();
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
    expect(leftNames).toEqual(['Add context']);
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
