import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalPostPlatformInstagram from '@/components/modals/content/post/ModalPostPlatformInstagram';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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

function renderCard(value: IPostPlatformConfig) {
  const updatePlatformConfig = vi.fn();
  render(
    <ModalPostPlatformInstagram
      config={value}
      isEnabled
      isLoading={false}
      updatePlatformConfig={updatePlatformConfig}
    />,
  );
  return updatePlatformConfig;
}

describe('ModalPostPlatformInstagram', () => {
  it('offers Story and selects it for a Story config', () => {
    renderCard(config({ isStory: true }));

    expect(screen.getByRole('radio', { name: 'Story' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Reel only' })).not.toBeChecked();
  });

  it('chooses a Story without changing the media category', () => {
    const update = renderCard(config());

    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));

    expect(update).toHaveBeenCalledWith('cred-1', {
      isShareToFeedSelected: false,
      isStory: true,
    });
  });

  it('leaves Story when another type is chosen', () => {
    const update = renderCard(config({ isStory: true }));

    fireEvent.click(screen.getByRole('radio', { name: 'Reel + Feed' }));

    expect(update).toHaveBeenCalledWith('cred-1', {
      category: PostCategory.VIDEO,
      isShareToFeedSelected: true,
      isStory: false,
    });
  });
});
