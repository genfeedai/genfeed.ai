import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('AgentOAuthConnectMenu', () => {
  it('invokes OAuth and closes after a successful async handoff', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn().mockResolvedValue(undefined);
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );
    await user.click(screen.getByRole('button', { name: 'Twitter' }));

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Twitter' }),
      ).not.toBeInTheDocument();
    });
  });

  it('recovers when the handoff returns without navigating', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn(() => undefined);
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    const trigger = screen.getByRole('button', {
      name: 'Connect a social channel',
    });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Twitter' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Twitter' }),
      ).not.toBeInTheDocument();
    });
    await user.click(trigger);

    expect(screen.getByRole('button', { name: 'Twitter' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a synchronous failure and leaves the action retryable', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('popup blocked');
      })
      .mockReturnValue(undefined);
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );
    const twitterButton = screen.getByRole('button', { name: 'Twitter' });
    await user.click(twitterButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the connection. Please try again.',
    );
    expect(twitterButton).toBeEnabled();

    await user.click(twitterButton);
    expect(onOAuthConnect).toHaveBeenCalledTimes(2);
  });

  it('surfaces an async failure and leaves the action retryable', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn().mockRejectedValue(new Error('api down'));
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );
    const twitterButton = screen.getByRole('button', { name: 'Twitter' });
    await user.click(twitterButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the connection. Please try again.',
    );
    expect(twitterButton).toBeEnabled();
  });
});
