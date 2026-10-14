import type { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardPromptBar from './StoryboardPromptBar';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const input = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: (props: ComponentProps<typeof AgentChatInput>) => {
    input.props = props;
    return (
      <div>
        <p data-testid="placeholder">{props.placeholder}</p>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onSend('Write a founder story')}
        >
          Send message
        </button>
      </div>
    );
  },
}));

function renderBar(
  props: Partial<ComponentProps<typeof StoryboardPromptBar>> = {},
) {
  return render(
    <StoryboardPromptBar
      hasShots={false}
      isDisabled={false}
      onRetry={vi.fn()}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

describe('storyboard prompt bar', () => {
  it('is the Agent composer with the Agent-only controls hidden', () => {
    renderBar();
    expect(input.props).toMatchObject({ isAgentControlsHidden: true });
  });
  it('asks for the brief before there are shots and for changes after', () => {
    const { unmount } = renderBar();
    expect(screen.getByTestId('placeholder')).toHaveTextContent(
      'Describe the video you want to make',
    );
    unmount();
    renderBar({ hasShots: true });
    expect(screen.getByTestId('placeholder')).toHaveTextContent(
      'Ask for changes',
    );
  });
  it('hands the text on and lets the composer clear straight away', () => {
    const onSubmit = vi.fn();
    renderBar({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onSubmit).toHaveBeenCalledWith('Write a founder story');
    expect(
      (input.props as ComponentProps<typeof AgentChatInput>).onSend('again'),
    ).toBe(true);
  });
  it('disables send while a draft is running', () => {
    renderBar({ isDisabled: true });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
  it('shows a failed draft with a retry', () => {
    const onRetry = vi.fn();
    renderBar({ error: 'Model unavailable', onRetry });
    expect(screen.getByText('Model unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
