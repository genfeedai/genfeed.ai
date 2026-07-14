import { OAuthConnectCard } from '@genfeedai/agent/components/AgentChatMessageCards';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const action = {
  id: 'connect-twitter',
  platform: 'twitter',
  type: 'oauth_connect_card',
} as AgentUiAction;

describe('OAuthConnectCard', () => {
  it('keeps the dedicated conversation action retryable after OAuth rejects', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValue(new Error('OAuth unavailable'));
    render(<OAuthConnectCard action={action} onConnect={onConnect} />);

    const connectButton = screen.getByRole('button', {
      name: 'Connect X (Twitter)',
    });
    await user.click(connectButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the connection. Please try again.',
    );
    expect(connectButton).toBeEnabled();
  });
});
