import {
  BRAND_REMIX_RUN_CONTRACT,
  brandRemixRunViewSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioRemixScenes from './StudioRemixScenes';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org' }),
}));
vi.mock('@hooks/data/ingredients/use-avatar-images/use-avatar-images', () => ({
  useAvatarImages: () => ({ avatars: [], isLoading: false }),
}));
vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: () => ({ voices: [], isLoading: false }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@genfeedai/agent/components/ContentLibraryPicker', () => ({
  ContentLibraryPicker: () => null,
}));
vi.mock(
  '@pages/studio/generate/components/StudioGenerateSettingsPopover',
  () => ({
    OptionSelect: ({
      ariaLabel,
      onChange,
    }: {
      ariaLabel: string;
      onChange: (value: string) => void;
    }) => (
      <span
        role="option"
        tabIndex={0}
        aria-selected={false}
        onClick={() => onChange(`${ariaLabel}-1`)}
        onKeyDown={() => onChange(`${ariaLabel}-1`)}
      >
        {ariaLabel}
      </span>
    ),
  }),
);
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: () => null,
}));
const getService = vi.fn().mockResolvedValue({
  findAll: vi.fn().mockResolvedValue([]),
  findOne: vi.fn(),
});
const actions = {
  saveScenes: vi.fn(),
  attachSceneSource: vi.fn(),
  quoteScenes: vi.fn(),
  executeScenes: vi.fn(),
  cancelScenes: vi.fn(),
  resumeScenes: vi.fn(),
};
function fixture() {
  return brandRemixRunViewSchema.parse({
    id: 'run',
    brandId: 'brand',
    brand: { id: 'brand', name: 'Brand', contextMode: 'brand' },
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    status: 'pending',
    contract: BRAND_REMIX_RUN_CONTRACT,
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'prefilled',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'Original' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Imported',
    },
    concept: {
      savedAt: '2026-09-24T00:00:00.000Z',
      storyboard: [
        {
          id: 'a',
          ordinal: 1,
          durationSeconds: 5,
          visualIntent: 'Brand product',
          narration: 'Original speech',
        },
        {
          id: 'b',
          ordinal: 2,
          durationSeconds: 5,
          visualIntent: 'Brand benefit',
          narration: 'New benefit',
        },
      ],
    },
  });
}
describe('Studio scene explicit actions', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requests an analysis quote without accepting or executing it', () => {
    render(
      <StudioRemixScenes run={fixture()} actions={actions} isWorking={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'analyze' }));
    expect(actions.quoteScenes).toHaveBeenCalledWith({ operation: 'analysis' });
    expect(actions.executeScenes).not.toHaveBeenCalled();
  });
  it('saves an edited narration without generation and preserves scene identity', () => {
    render(
      <StudioRemixScenes run={fixture()} actions={actions} isWorking={false} />,
    );
    fireEvent.change(screen.getAllByLabelText('narration')[0], {
      target: { value: 'Edited original speech' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(actions.saveScenes).toHaveBeenCalledWith({
      concept: {
        storyboard: expect.arrayContaining([
          expect.objectContaining({
            id: 'a',
            narration: 'Edited original speech',
          }),
        ]),
      },
    });
    expect(actions.executeScenes).not.toHaveBeenCalled();
  });
  function withPipeline(
    state: NonNullable<ReturnType<typeof fixture>['scenePipeline']>['state'],
  ) {
    const run = fixture();
    run.scenePipeline = {
      version: 1,
      language: 'en',
      state,
      cancellationGeneration: 0,
      operation: {
        id: 'op',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: '2026-09-24T00:00:00.000Z',
        userId: 'user',
        sequence: 0,
      },
      scenes: {},
      receipts: [],
      replacedAssetIds: [],
    };
    return run;
  }
  it('offers cancellation but not a concurrent resume while paid work is processing', () => {
    render(
      <StudioRemixScenes
        run={withPipeline('generating')}
        actions={actions}
        isWorking={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(actions.cancelScenes).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'quote' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'resume' })).toBeNull();
  });
  it('offers resume once an accepted operation stopped', () => {
    for (const state of ['partial_failure', 'cancelled'] as const) {
      const { unmount } = render(
        <StudioRemixScenes
          run={withPipeline(state)}
          actions={actions}
          isWorking={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'resume' }));
      unmount();
    }
    expect(actions.resumeScenes).toHaveBeenCalledTimes(2);
  });
  it('blocks saving a scene override until both avatar and voice are chosen', () => {
    render(
      <StudioRemixScenes run={fixture()} actions={actions} isWorking={false} />,
    );
    fireEvent.click(screen.getAllByRole('option', { name: 'avatar' })[0]);
    expect(screen.getByText('identityPairRequired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('option', { name: 'voice' })[0]);
    expect(screen.queryByText('identityPairRequired')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(actions.saveScenes).toHaveBeenCalledWith({
      concept: {
        storyboard: expect.arrayContaining([
          expect.objectContaining({
            id: 'a',
            identity: { avatarAssetId: 'avatar-1', speechVoiceId: 'voice-1' },
          }),
        ]),
      },
    });
  });
});
