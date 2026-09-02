import { ContentRunStatus } from '@genfeedai/contracts';
import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  avatarHook: vi.fn(),
  close: vi.fn(),
  confirm: vi.fn(),
  run: { value: null as unknown },
  voiceHook: vi.fn(),
}));

const run: BrandRemixRunView = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  brandId: 'brand-1',
  contract: 'brand-remix-run',
  createdAt: '2026-08-20T10:00:00.000Z',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: {
      callToAction: 'See the difference',
      hook: 'Proof before promise',
      objective: 'Turn the winning hook into a Northstar product reveal.',
      visualDirection: 'Fast cuts, clean product close-up',
    },
    output: { aspectRatio: '9:16', count: 3, kind: 'video' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
  id: 'run-1',
  phase: 'prefilled',
  readiness: {
    issues: [
      {
        code: 'organization_defaults',
        field: 'intent',
        message: 'Using organization defaults until brand assets are added.',
        severity: 'degraded',
      },
    ],
    state: 'degraded',
  },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['The first three seconds establish proof.'],
    metrics: { views: 123000 },
    pattern: {
      hook: 'Proof before promise',
      pacing: 'Three fast proof beats, then product reveal',
    },
    platform: 'tiktok',
    selector: {
      kind: 'trend_reference',
      sourceReferenceId: 'source-reference-1',
      trendId: 'trend-1',
    },
    sourceId: 'source-reference-1',
    title: 'Proof-led TikTok hook',
  },
  status: ContentRunStatus.PENDING,
  updatedAt: '2026-08-20T10:00:00.000Z',
  version: 1,
};

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useDiscoveryRemix: () => ({
    close: mocks.close,
    confirm: mocks.confirm,
    error: null,
    isOpen: true,
    openRemix: vi.fn(),
    retry: vi.fn(),
    run: mocks.run.value,
    status: 'ready',
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));

vi.mock('@hooks/data/ingredients/use-avatar-images/use-avatar-images', () => ({
  useAvatarImages: (...args: unknown[]) => mocks.avatarHook(...args),
}));

vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: (...args: unknown[]) => mocks.voiceHook(...args),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/overlays/context-inspector/ContextInspector', () => ({
  default: ({
    children,
    footer,
    isOpen,
    title,
  }: PropsWithChildren<{
    footer?: ReactNode;
    isOpen: boolean;
    title: ReactNode;
  }>) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock('@/features/library-remix/LibraryPickerOverlay', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (reference: {
      brandId: string;
      kind: 'ingredient';
      organizationId: string;
      recordId: string;
      serializer: 'ingredients';
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          brandId: 'brand-1',
          kind: 'ingredient',
          organizationId: 'org-1',
          recordId: 'ingredient-1',
          serializer: 'ingredients',
        })
      }
    >
      Choose library asset
    </button>
  ),
}));

import RemixBriefInspector, {
  buildRemixDraftEdits,
} from './RemixBriefInspector';

describe('RemixBriefInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run.value = run;
    mocks.avatarHook.mockReturnValue({
      avatars: [
        {
          id: 'avatar-row-1',
          metadataLabel: 'Avatar One',
          status: 'GENERATED',
        },
        {
          brandId: 'brand-other',
          id: 'avatar-row-other-brand',
          metadataLabel: 'Other Brand Avatar',
          status: 'GENERATED',
        },
        {
          id: 'avatar-row-processing',
          metadataLabel: 'Processing Avatar',
          status: 'PROCESSING',
        },
      ],
      isLoading: false,
    });
    mocks.voiceHook.mockReturnValue({
      isLoading: false,
      voices: [
        {
          externalVoiceId: 'provider-voice-99',
          id: 'voice-row-1',
          metadataLabel: 'Voice One',
          provider: 'elevenlabs',
          status: 'GENERATED',
        },
        {
          brandId: 'brand-other',
          externalVoiceId: 'other-brand-provider-voice',
          id: 'voice-row-other-brand',
          metadataLabel: 'Other Brand Voice',
          provider: 'elevenlabs',
          status: 'GENERATED',
        },
        {
          externalVoiceId: 'failed-provider-voice',
          id: 'voice-row-failed',
          metadataLabel: 'Failed Voice',
          status: 'FAILED',
        },
        {
          id: 'voice-row-unusable',
          metadataLabel: 'Unusable Voice',
          status: 'VALIDATED',
        },
      ],
    });
  });

  it('shows the server-derived pattern, brand, readiness, and recipe', () => {
    render(<RemixBriefInspector />);

    expect(
      screen.getByRole('heading', { name: 'Remix for Northstar' }),
    ).toBeVisible();
    expect(screen.getByText('Proof before promise')).toBeVisible();
    expect(
      screen.getByText('Three fast proof beats, then product reveal'),
    ).toBeVisible();
    expect(screen.getByText('Degraded')).toBeVisible();
    expect(screen.getByText('Recipe v1 · revision 1')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Fidelity' })).toBeVisible();
    expect(
      screen.getByText(/Guided keeps the source pattern flexible/i),
    ).toBeVisible();
    expect(mocks.avatarHook).not.toHaveBeenCalled();
    expect(mocks.voiceHook).not.toHaveBeenCalled();
  });

  it('persists the edited brief and semantic Library reference on confirmation', async () => {
    render(<RemixBriefInspector />);

    fireEvent.change(screen.getByLabelText('Creative objective'), {
      target: { value: 'Keep the proof and foreground the product benefit.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Library asset' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose library asset' }),
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Fidelity' }));
    fireEvent.click(screen.getByRole('option', { name: 'Strict' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Studio' }));

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        fidelityMode: 'strict',
        intent: expect.objectContaining({
          objective: 'Keep the proof and foreground the product benefit.',
        }),
        references: [
          {
            assetId: 'ingredient-1',
            role: 'style',
          },
        ],
      }),
    );
  });

  it('edits the platform and grouped copy recommendation while preserving manual Review', () => {
    render(<RemixBriefInspector />);

    expect(screen.getByText(/Organic · manual Review required/i)).toBeVisible();
    expect(
      screen.getByText(/Every output enters manual Review/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('combobox', { name: 'Target platform' }));
    fireEvent.click(screen.getByRole('option', { name: 'Instagram' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Output type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Copy' }));
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Number of variations' }),
    );
    fireEvent.click(screen.getByRole('option', { name: '4 variations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Studio' }));

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { count: 4, kind: 'copy' },
        target: { kind: 'organic', platform: 'instagram' },
      }),
    );
  });

  it('keeps a server-blocked brief editable and revalidatable', () => {
    mocks.run.value = {
      ...run,
      readiness: {
        issues: [
          {
            code: 'unsupported_fidelity',
            field: 'fidelityMode',
            message: 'Strict fidelity is not available yet.',
            severity: 'blocked',
          },
        ],
        state: 'blocked',
      },
    };

    render(<RemixBriefInspector />);

    expect(
      screen.getByText('Strict fidelity is not available yet.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Continue to Studio' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Studio' }));
    expect(mocks.confirm).toHaveBeenCalled();
  });

  it('clears video duration when the user changes the output to image', () => {
    expect(
      buildRemixDraftEdits(
        {
          aspectRatio: '1:1',
          avatarAssetId: '',
          callToAction: '',
          count: 2,
          fidelityMode: 'guided',
          hook: '',
          objective: 'Turn the hook into a square product image.',
          outputKind: 'image',
          references: [],
          speechVoiceId: '',
          targetPlatform: 'tiktok',
          visualDirection: '',
        },
        {
          ...run,
          draft: {
            ...run.draft,
            output: {
              aspectRatio: '9:16',
              count: 3,
              durationSeconds: 8,
              kind: 'video',
            },
          },
        },
      ).output,
    ).toEqual({
      aspectRatio: '1:1',
      count: 2,
      durationSeconds: null,
      kind: 'image',
    });
  });

  it('edits only explicit references and leaves brand defaults server-owned', () => {
    expect(
      buildRemixDraftEdits(
        {
          aspectRatio: '9:16',
          avatarAssetId: '',
          callToAction: '',
          count: 2,
          fidelityMode: 'strict',
          hook: '',
          objective: 'Keep the source hook.',
          outputKind: 'video',
          references: [
            {
              assetId: 'brand-default-1',
              role: 'product',
              source: 'brand_default',
            },
            {
              assetId: 'explicit-1',
              role: 'style',
              source: 'explicit',
            },
          ],
          speechVoiceId: '',
          targetPlatform: 'tiktok',
          visualDirection: '',
        },
        run,
      ),
    ).toMatchObject({
      fidelityMode: 'strict',
      references: [{ assetId: 'explicit-1', role: 'style' }],
    });
  });

  it('requires a paired durable avatar and voice identity for avatar output', () => {
    mocks.run.value = {
      ...run,
      draft: {
        ...run.draft,
        identity: {},
        output: {
          aspectRatio: '9:16',
          count: 2,
          durationSeconds: 8,
          kind: 'avatar',
        },
      },
    };

    render(<RemixBriefInspector />);

    expect(screen.getByLabelText('Spoken script')).toBeVisible();
    expect(screen.getByText(/spoken exactly as written/i)).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: 'Avatar identity' }),
    ).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: 'Voice identity' }),
    ).toBeVisible();
    expect(
      screen.getByText('Choose both an avatar and a voice to continue.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Continue to Studio' }),
    ).toBeDisabled();
    expect(mocks.avatarHook).toHaveBeenCalledWith('org-1');
    expect(mocks.voiceHook).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });

  it('offers only generation-ready avatar and usable voice rows', () => {
    mocks.run.value = {
      ...run,
      draft: {
        ...run.draft,
        identity: {},
        output: {
          aspectRatio: '9:16',
          count: 2,
          durationSeconds: 8,
          kind: 'avatar',
        },
      },
    };

    render(<RemixBriefInspector />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Avatar identity' }));
    expect(screen.getByRole('option', { name: 'Avatar One' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Processing Avatar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Other Brand Avatar' }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('combobox', { name: 'Voice identity' }));
    expect(
      screen.getByRole('option', { name: 'Voice One (elevenlabs)' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Failed Voice (elevenlabs)' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Unusable Voice' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', {
        name: 'Other Brand Voice (elevenlabs)',
      }),
    ).not.toBeInTheDocument();
  });

  it('emits durable ingredient row ids for a complete avatar identity', () => {
    expect(
      buildRemixDraftEdits(
        {
          aspectRatio: '9:16',
          avatarAssetId: 'avatar-row-1',
          callToAction: '',
          count: 2,
          fidelityMode: 'guided',
          hook: '',
          objective: 'Deliver the source hook through the brand avatar.',
          outputKind: 'avatar',
          references: [],
          speechVoiceId: 'voice-row-1',
          targetPlatform: 'tiktok',
          visualDirection: '',
        },
        run,
      ).identity,
    ).toEqual({
      avatarAssetId: 'avatar-row-1',
      speechVoiceId: 'voice-row-1',
    });
  });
});
