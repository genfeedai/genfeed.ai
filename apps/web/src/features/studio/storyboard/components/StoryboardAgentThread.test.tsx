import type { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardAgentThread from './StoryboardAgentThread';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const input = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: (props: ComponentProps<typeof AgentChatInput>) => {
    input.props = props;
    return <p data-testid="composer">{props.prefill?.content}</p>;
  },
}));

function renderThread(
  props: Partial<ComponentProps<typeof StoryboardAgentThread>> = {},
) {
  return render(
    <StoryboardAgentThread
      canCompose
      hasShots={false}
      isDisabled={false}
      onRetry={vi.fn()}
      onSubmit={vi.fn()}
      requests={[]}
      {...props}
    />,
  );
}

describe('storyboard agent thread starter cards', () => {
  it('fills the composer with the picked pitch and does not send it', () => {
    const onSubmit = vi.fn();
    renderThread({ onSubmit });
    fireEvent.click(screen.getByTestId('storyboard-starter-productTeaser'));
    expect(screen.getByTestId('composer')).toHaveTextContent(
      'A 20-second teaser for a product launch',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gives each pick a new nonce so the same card can be picked again', () => {
    renderThread();
    fireEvent.click(screen.getByTestId('storyboard-starter-howTo'));
    const first = (input.props as ComponentProps<typeof AgentChatInput>)
      .prefill;
    fireEvent.click(screen.getByTestId('storyboard-starter-howTo'));
    const second = (input.props as ComponentProps<typeof AgentChatInput>)
      .prefill;
    expect(second?.nonce).toBe((first?.nonce ?? 0) + 1);
  });

  it('hides the cards once the board has shots, a request exists, or composing is off', () => {
    const { unmount } = renderThread({ hasShots: true });
    expect(screen.queryByTestId('storyboard-starter-cards')).toBeNull();
    unmount();
    const second = renderThread({
      requests: [{ id: 'r1', kind: 'brief', state: 'working', text: 'Hi' }],
    });
    expect(screen.queryByTestId('storyboard-starter-cards')).toBeNull();
    second.unmount();
    renderThread({ canCompose: false });
    expect(screen.queryByTestId('storyboard-starter-cards')).toBeNull();
  });
});
