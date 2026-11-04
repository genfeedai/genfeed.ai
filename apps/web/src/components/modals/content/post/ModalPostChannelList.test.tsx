import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalPostChannelList from '@/components/modals/content/post/ModalPostChannelList';

function channel(
  overrides: Partial<IPostPlatformConfig> = {},
): IPostPlatformConfig {
  return {
    credentialId: 'cred-x',
    customScheduledDate: '',
    description: '',
    enabled: true,
    handle: 'genfeed-x',
    isCredentialValid: true,
    label: '',
    overrideSchedule: false,
    platform: CredentialPlatform.TWITTER,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  };
}

const credentials = [
  {
    externalHandle: 'genfeed-x',
    externalName: 'Genfeed on X',
    id: 'cred-x',
    isConnected: true,
    platform: CredentialPlatform.TWITTER,
  } as unknown as ICredential,
];

function renderList(
  overrides: Partial<Parameters<typeof ModalPostChannelList>[0]> = {},
) {
  const handlers = {
    onAddChannels: vi.fn(),
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    onToggleExpanded: vi.fn(),
  };
  render(
    <ModalPostChannelList
      credentials={credentials}
      expandedPlatform={null}
      globalDescription="Launch day"
      isLoading={false}
      platformConfigs={[
        channel(),
        channel({
          credentialId: 'cred-yt',
          enabled: false,
          handle: 'genfeed-yt',
          isCredentialValid: false,
          platform: CredentialPlatform.YOUTUBE,
        }),
        channel({
          credentialId: '',
          enabled: false,
          handle: '',
          isCredentialValid: undefined,
          platform: CredentialPlatform.TIKTOK,
        }),
      ]}
      renderEditor={(config) => <p>Editor for {config.platform}</p>}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('ModalPostChannelList', () => {
  it('counts only connected channels with a valid connection', () => {
    renderList();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/of 1 active/)).toBeInTheDocument();
  });

  it('shows the connected account name and the caption it will carry', () => {
    renderList();

    expect(screen.getByText('Genfeed on X')).toBeInTheDocument();
    expect(screen.getByText('Launch day')).toBeInTheDocument();
  });

  it('offers Reconnect for an expired account and Connect for a missing one', () => {
    const { onAddChannels } = renderList();

    expect(
      screen.getByText('Reconnect this account to publish'),
    ).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Reconnect/ }));

    expect(onAddChannels).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('toggles one channel with its switch', () => {
    const { onToggle } = renderList();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Publish to Genfeed on X' }),
    );

    expect(onToggle).toHaveBeenCalledWith('cred-x');
  });

  it('turns every channel on or off together', () => {
    const { onToggleAll } = renderList();

    fireEvent.click(
      screen.getByRole('button', { name: 'Turn all channels off' }),
    );

    expect(onToggleAll).toHaveBeenCalledWith(false);
  });

  it('reveals the editor of the channel being edited', () => {
    const { onToggleExpanded } = renderList({
      expandedPlatform: CredentialPlatform.TWITTER,
    });

    expect(screen.getByText('Editor for twitter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Genfeed on X' }));
    expect(onToggleExpanded).toHaveBeenCalledWith('twitter');
  });
});
