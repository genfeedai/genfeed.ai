import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalPostPlatformInstagramMusic from '@/components/modals/content/post/ModalPostPlatformInstagramMusic';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const tracksQuery = vi.hoisted(() => ({
  current: {
    data: [] as unknown[],
    isError: false,
    isLoading: false,
  },
}));

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: () => tracksQuery.current,
}));

const config = (overrides: Partial<IPostPlatformConfig> = {}) =>
  ({
    category: PostCategory.VIDEO,
    credentialId: 'cred-1',
    customScheduledDate: '',
    description: '',
    enabled: true,
    handle: 'acme',
    isShareToFeedSelected: false,
    label: '',
    overrideSchedule: false,
    platform: CredentialPlatform.INSTAGRAM,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  }) as IPostPlatformConfig;

function renderMusic(value: IPostPlatformConfig) {
  const updatePlatformConfig = vi.fn();
  render(
    <ModalPostPlatformInstagramMusic
      config={value}
      isEnabled
      isLoading={false}
      updatePlatformConfig={updatePlatformConfig}
    />,
  );
  return updatePlatformConfig;
}

describe('ModalPostPlatformInstagramMusic', () => {
  beforeEach(() => {
    tracksQuery.current = { data: [], isError: false, isLoading: false };
  });

  it('asks for no music until the person opens the search', () => {
    renderMusic(config());

    expect(
      screen.getByRole('button', { name: 'Search Instagram music' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('attaches the chosen track at full volume', () => {
    tracksQuery.current = {
      data: [
        {
          artist: 'Shuba',
          audioType: 'music',
          id: '587',
          title: 'Birthday Wish',
        },
      ],
      isError: false,
      isLoading: false,
    };
    const update = renderMusic(config());

    fireEvent.click(
      screen.getByRole('button', { name: 'Search Instagram music' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Birthday Wish by Shuba' }),
    );

    expect(update).toHaveBeenCalledWith('cred-1', {
      reelAudio: {
        artist: 'Shuba',
        audioId: '587',
        audioVolume: 100,
        title: 'Birthday Wish',
        videoVolume: 100,
      },
    });
  });

  it('says why the search failed instead of listing nothing', () => {
    tracksQuery.current = { data: [], isError: true, isLoading: false };
    renderMusic(config());

    fireEvent.click(
      screen.getByRole('button', { name: 'Search Instagram music' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load Instagram music',
    );
  });

  it('shows the attached track and removes it', () => {
    const update = renderMusic(
      config({
        reelAudio: {
          artist: 'Shuba',
          audioId: '587',
          audioVolume: 80,
          title: 'Birthday Wish',
          videoVolume: 50,
        },
      }),
    );

    expect(screen.getByText('Birthday Wish by Shuba')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove music' }));

    expect(update).toHaveBeenCalledWith('cred-1', { reelAudio: undefined });
  });
});
