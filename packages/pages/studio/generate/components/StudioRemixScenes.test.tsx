import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brandRemixRunViewSchema,
  BRAND_REMIX_RUN_CONTRACT,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
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
  () => ({ OptionSelect: () => null }),
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
    status: 'PENDING',
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
  it('offers cancellation while paid work is processing', () => {
    const run = fixture();
    run.scenePipeline = {
      version: 1,
      language: 'en',
      state: 'generating',
      cancellationGeneration: 0,
      scenes: {},
      receipts: [],
      replacedAssetIds: [],
    };
    render(<StudioRemixScenes run={run} actions={actions} isWorking={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(actions.cancelScenes).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'quote' })).toBeDisabled();
  });
});
