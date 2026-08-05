import {
  ContentPreviewCard,
  OAuthConnectCard,
} from '@genfeedai/agent/components/AgentChatMessageCards';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('ContentPreviewCard', () => {
  it('opens generated image variants from the conversation card', () => {
    render(
      <ContentPreviewCard
        action={{
          id: 'image-output',
          images: [
            'https://cdn.test/image-1.png',
            'https://cdn.test/image-2.png',
          ],
          title: 'Campaign image',
          type: 'content_preview_card',
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open Campaign image 2 preview',
      }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Image preview · 2 of 2')).toBeInTheDocument();
  });
});
