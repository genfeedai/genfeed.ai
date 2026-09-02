import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveOAuthConnectPlatformCatalog } from '@ui/constants/oauth-connect-platforms';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useOAuthConnectPlatforms = vi.hoisted(() => vi.fn());

vi.mock(
  '@hooks/auth/use-oauth-connect-platforms/use-oauth-connect-platforms',
  () => ({ useOAuthConnectPlatforms }),
);

describe('AgentOAuthConnectMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOAuthConnectPlatforms.mockReturnValue(
      resolveOAuthConnectPlatformCatalog({ threads: 'available' }),
    );
  });

  it.each(['unknown', 'unavailable'] as const)(
    'omits Threads and cannot issue a connect request when readiness is %s',
    async (readiness) => {
      const user = userEvent.setup();
      const onOAuthConnect = vi.fn();
      useOAuthConnectPlatforms.mockReturnValue(
        resolveOAuthConnectPlatformCatalog({ threads: readiness }),
      );
      render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

      await user.click(
        screen.getByRole('button', { name: 'Connect a social channel' }),
      );

      expect(
        screen.queryByRole('button', { name: 'Threads' }),
      ).not.toBeInTheDocument();
      expect(onOAuthConnect).not.toHaveBeenCalled();
    },
  );

  it('connects one available Threads action through its canonical service path', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn().mockResolvedValue(undefined);
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );
    await user.click(screen.getByRole('button', { name: 'Threads' }));

    expect(onOAuthConnect).toHaveBeenCalledOnce();
    expect(onOAuthConnect).toHaveBeenCalledWith('threads');
  });

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

  it('omits excluded platforms from the open menu', async () => {
    const user = userEvent.setup();
    render(
      <AgentOAuthConnectMenu
        excludePlatforms={new Set(['twitter'])}
        onOAuthConnect={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );

    expect(
      screen.queryByRole('button', { name: 'Twitter' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Instagram' }),
    ).toBeInTheDocument();
  });

  it('offers Fanvue through its service route and omits unavailable X Ads', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn().mockResolvedValue(undefined);
    render(<AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );

    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'X Ads' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fanvue' }));

    expect(onOAuthConnect).toHaveBeenCalledWith('fanvue');
  });

  it('opens on the elevated overlay surface, not the canvas panel', async () => {
    const user = userEvent.setup();
    render(<AgentOAuthConnectMenu onOAuthConnect={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );

    const panel = screen
      .getByText('Connect a channel')
      .closest('div[class*="w-[20rem]"]');
    expect(panel).toHaveClass('bg-secondary');
    expect(panel).toHaveClass('shadow-dropdown');
    expect(document.querySelector('.gen-shell-panel')).toBeNull();
  });
});
