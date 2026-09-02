import '@testing-library/jest-dom/vitest';

import type { MultiPostSchema } from '@genfeedai/client/schemas';
import {
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IIngredient,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ModalPostPlatformsTab, {
  buildComposerPreviewTargets,
} from '@ui/modals/content/post/ModalPostPlatformsTab';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@genfeedai/hooks/data/content/use-posting-sets/use-posting-sets',
  () => ({
    usePostingSets: () => ({
      createSet: vi.fn(),
      expandError: null,
      expandSet: vi.fn(),
      isExpanding: false,
      isLoading: false,
      isSaving: false,
      saveError: null,
      sets: [],
    }),
  }),
);

vi.mock(
  '@genfeedai/hooks/data/content/use-posting-signatures/use-posting-signatures',
  () => ({
    usePostingSignatures: () => ({
      isLoading: false,
      signatures: [],
    }),
  }),
);

const TEST_MIN_DATE = new Date('2025-01-01T00:00:00.000Z');

const createFormStub = (): UseFormReturn<MultiPostSchema> =>
  ({
    watch: vi.fn((field: string) => {
      if (field === 'globalLabel') {
        return 'Global Label';
      }

      if (field === 'globalDescription') {
        return 'Global Description';
      }

      return '';
    }),
  }) as unknown as UseFormReturn<MultiPostSchema>;

function platformConfig(
  overrides: Partial<IPostPlatformConfig> = {},
): IPostPlatformConfig {
  return {
    credentialId: 'cred-instagram',
    customScheduledDate: '',
    description: 'Instagram launch copy',
    enabled: true,
    handle: 'genfeed-instagram',
    label: 'Instagram launch',
    overrideSchedule: false,
    platform: CredentialPlatform.INSTAGRAM,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  };
}

describe('ModalPostPlatformsTab', () => {
  it('calls togglePlatform once when enabling a connected platform', () => {
    const togglePlatform = vi.fn();

    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        ingredients={[]}
        platformConfigs={[platformConfig({ enabled: false })]}
        isLoading={false}
        togglePlatform={togglePlatform}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));

    expect(togglePlatform).toHaveBeenCalledOnce();
    expect(togglePlatform).toHaveBeenCalledWith('cred-instagram');
    expect(screen.getByLabelText('Saved posting set')).toBeInTheDocument();
  });

  it('previews every selected channel and switches between their overrides', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        ingredients={[]}
        platformConfigs={[
          platformConfig(),
          platformConfig({
            credentialId: 'cred-twitter',
            description: 'X-specific launch copy',
            handle: 'genfeed-x',
            label: '',
            platform: CredentialPlatform.TWITTER,
          }),
        ]}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    expect(screen.getByText('Live preview')).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Instagram platform preview' }),
    ).toBeVisible();
    const preview = screen.getByLabelText('Platform preview');
    expect(within(preview).getByText('Instagram launch copy')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'X (Twitter)' }));

    expect(
      screen.getByRole('article', { name: 'X (Twitter) platform preview' }),
    ).toBeVisible();
    expect(within(preview).getByText('X-specific launch copy')).toBeVisible();
  });

  it('hides and restores the selected-channel preview', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        ingredients={[]}
        platformConfigs={[platformConfig()]}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /hide preview/i }));
    expect(screen.queryByLabelText('Platform preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show preview/i }));
    expect(screen.getByLabelText('Platform preview')).toBeInTheDocument();
  });

  it('omits disabled, disconnected, and invalid channel selections', () => {
    const targets = buildComposerPreviewTargets(
      [
        platformConfig(),
        platformConfig({
          credentialId: 'cred-twitter',
          enabled: false,
          platform: CredentialPlatform.TWITTER,
        }),
        platformConfig({
          credentialId: '',
          platform: CredentialPlatform.LINKEDIN,
        }),
        platformConfig({
          credentialId: 'cred-youtube',
          isCredentialValid: false,
          platform: CredentialPlatform.YOUTUBE,
        }),
      ],
      [],
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      caption: 'Instagram launch copy',
      platform: CredentialPlatform.INSTAGRAM,
      title: 'Instagram launch',
    });
  });

  it('shares the exact selected media with every channel preview', () => {
    const ingredient = {
      category: IngredientCategory.GIF,
      id: 'media-1',
      ingredientUrl: 'https://cdn.example.com/launch.gif',
      metadataLabel: 'Launch animation',
      thumbnailUrl: 'https://cdn.example.com/launch.jpg',
    } as unknown as IIngredient;

    const targets = buildComposerPreviewTargets(
      [
        platformConfig(),
        platformConfig({
          credentialId: 'cred-twitter',
          platform: CredentialPlatform.TWITTER,
        }),
      ],
      [ingredient],
    );

    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.media).toEqual([
        expect.objectContaining({
          alt: 'Launch animation',
          id: 'media-1',
          isAnimated: true,
          url: 'https://cdn.example.com/launch.gif',
        }),
      ]);
    }
    expect(targets[0]?.settings).toMatchObject({ placement: 'feed' });
    expect(targets[0]?.publishMode).toBe('scheduled');
  });

  it('maps existing channel choices into canonical preview settings', () => {
    const targets = buildComposerPreviewTargets(
      [
        platformConfig({
          category: PostCategory.VIDEO,
        }),
        platformConfig({
          credentialId: 'cred-youtube',
          platform: CredentialPlatform.YOUTUBE,
          visibility: PostVisibility.UNLISTED,
        }),
      ],
      [],
    );

    expect(targets[0]?.settings).toMatchObject({ placement: 'reel' });
    expect(targets[1]?.settings).toMatchObject({
      madeForKids: false,
      privacyStatus: 'unlisted',
    });
  });

  it('hides the preview section when no connected channel is selected', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        ingredients={[]}
        platformConfigs={[platformConfig({ enabled: false })]}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    expect(screen.queryByText('Live preview')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Platform preview')).not.toBeInTheDocument();
  });
});
