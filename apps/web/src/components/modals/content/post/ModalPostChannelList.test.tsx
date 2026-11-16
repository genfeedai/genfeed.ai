import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  IngredientCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IIngredient,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const image = {
  category: IngredientCategory.IMAGE,
  id: 'img-1',
} as IIngredient;

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
      media={[]}
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

    expect(screen.getByText('1 of 1 active')).toBeInTheDocument();
  });

  it('shows each channel with its platform and whether it is on', () => {
    renderList();

    expect(
      within(screen.getByRole('list', { name: 'Channels' })).getByText('On'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Publish to Genfeed on X' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers Reconnect for an expired account and Connect for a missing one', () => {
    const { onAddChannels } = renderList();

    expect(screen.getByText('Reconnect')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Reconnect/ }));

    expect(onAddChannels).toHaveBeenCalledOnce();
  });

  it('toggles one channel by its avatar', () => {
    const { onToggle } = renderList();

    fireEvent.click(
      screen.getByRole('button', { name: 'Publish to Genfeed on X' }),
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

  describe('a connected channel that cannot take the attached media', () => {
    const connected = (
      platform: CredentialPlatform,
      credentialId: string,
    ): IPostPlatformConfig =>
      channel({ credentialId, enabled: false, handle: credentialId, platform });
    const platformConfigs = [
      channel(),
      connected(CredentialPlatform.INSTAGRAM, 'cred-ig'),
      connected(CredentialPlatform.TIKTOK, 'cred-tt'),
    ];

    it('is disabled with what it needs when the post is text only', () => {
      const { onToggle } = renderList({ platformConfigs });

      expect(screen.getByText('Needs media')).toBeInTheDocument();
      expect(screen.getByText('Needs video')).toBeInTheDocument();
      expect(screen.getByText('1 of 1 active')).toBeInTheDocument();
      const instagram = screen.getByRole('button', {
        name: 'Publish to @cred-ig',
      });
      expect(instagram).toBeDisabled();
      fireEvent.click(instagram);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('is not offered an Edit button even when it was left on', () => {
      renderList({
        platformConfigs: [
          channel({
            credentialId: 'cred-ig',
            enabled: true,
            platform: CredentialPlatform.INSTAGRAM,
          }),
        ],
      });

      expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
      expect(screen.getByText('0 of 0 active')).toBeInTheDocument();
    });

    it('becomes selectable once an image is attached, TikTok still needs video', () => {
      renderList({ media: [image], platformConfigs });

      expect(
        screen.getByRole('button', { name: 'Publish to @cred-ig' }),
      ).toBeEnabled();
      expect(screen.queryByText('Needs media')).toBeNull();
      expect(screen.getByText('Needs video')).toBeInTheDocument();
      expect(screen.getByText('1 of 2 active')).toBeInTheDocument();
    });
  });
});
