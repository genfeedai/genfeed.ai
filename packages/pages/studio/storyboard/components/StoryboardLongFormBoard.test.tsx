import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardSegment } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type {
  StoryboardLongFormActions,
  StoryboardLongFormBoardProps,
} from '@genfeedai/props/studio/storyboard.props';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardLongFormBoard from './StoryboardLongFormBoard';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  openConfirm: vi.fn(),
  push: vi.fn(),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ info: mocks.info }) },
}));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({ useConfirmModal: () => ({ openConfirm: mocks.openConfirm }) }),
);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));

const HASH = 'a'.repeat(64);
const segments: StoryboardSegment[] = [
  {
    id: 'segment-1',
    ordinal: 1,
    sectionLabel: 'Hook',
    narration: 'Most creators quit too early. Here is why.',
    estimatedSeconds: 4,
    cutaways: [
      {
        id: 'cut-1',
        kind: 'still',
        brief: 'A calendar with crossed-out days',
        startSeconds: 1,
        durationSeconds: 2,
      },
    ],
  },
];

function chunk(state: StoryboardARollChunk['state']): StoryboardARollChunk {
  return {
    id: '0b8f4f7e-8d7a-4c1e-9a55-1f0f3c2f9e01',
    ordinal: 1,
    pieces: [{ segmentId: 'segment-1', start: 0, end: 42 }],
    text: segments[0]?.narration ?? '',
    fingerprint: HASH,
    estimatedSeconds: 4,
    state,
    actorUserId: 'user-1',
    credits: 12,
    billingMode: 'platform',
    ...(state === 'ready' ? { assetId: 'video-1', durationSeconds: 4.2 } : {}),
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:00:00.000Z',
  };
}

function runWith(config: Partial<StoryboardRun['config']> = {}) {
  return {
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    config: { revision: 3, ...config },
  } as unknown as StoryboardRun;
}

function actions(): StoryboardLongFormActions {
  return {
    isDrawingCutaways: false,
    quoteCutaways: vi.fn(async () => ({
      revision: 3,
      modelKey: 'image-model',
      billingMode: 'platform' as const,
      inputHash: HASH,
      items: [{ shotId: 'cut-1', credits: 2 }],
      total: 2,
    })),
    generateCutaways: vi.fn(async () => runWith()),
    quotePresenter: vi.fn(async () => ({
      revision: 3,
      modelKey: 'heygen/avatar-iv',
      billingMode: 'platform' as const,
      inputHash: HASH,
      items: [
        { ordinal: 1, characters: 42, estimatedSeconds: 65, credits: 30 },
      ],
      readyChunkIds: [],
      total: 30,
    })),
    renderPresenter: vi.fn(async () => runWith()),
    assembleLongForm: vi.fn(async () => 'project-9'),
  };
}

function renderBoard(overrides: Partial<StoryboardLongFormBoardProps> = {}) {
  const onPerform = vi.fn((action: (revision: number) => Promise<unknown>) => {
    void action(3);
  });
  const props: StoryboardLongFormBoardProps = {
    run: runWith(),
    segments,
    isApproved: false,
    isDisabled: false,
    cutawayStills: {},
    onPatchSegment: vi.fn(),
    onPatchCutaway: vi.fn(),
    onPerform,
    actions: actions(),
    ...overrides,
  };
  render(<StoryboardLongFormBoard {...props} />);
  return props;
}

describe('StoryboardLongFormBoard', () => {
  beforeEach(() => {
    mocks.info.mockClear();
    mocks.openConfirm.mockClear();
    mocks.push.mockClear();
  });

  it('shows the script and holds the presenter render until approval', () => {
    renderBoard();
    expect(screen.getByDisplayValue(segments[0]?.narration ?? '')).toBeTruthy();
    expect(
      screen.getByDisplayValue('A calendar with crossed-out days'),
    ).toBeTruthy();
    expect(screen.getByText('0 of 1 cutaways have footage')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Render presenter' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByText('Approve the storyboard to render the presenter.'),
    ).toBeTruthy();
  });

  it('prices the missing B-roll stills, then draws them', async () => {
    const props = renderBoard();
    await userEvent.click(
      screen.getByRole('button', { name: 'Draw missing stills' }),
    );
    await waitFor(() =>
      expect(props.actions?.generateCutaways).toHaveBeenCalled(),
    );
    expect(props.actions?.quoteCutaways).toHaveBeenCalledWith(3);
    expect(mocks.info).toHaveBeenCalledWith('1 still: 2 credits');
  });

  it('asks before the paid presenter render and renders the accepted quote', async () => {
    const props = renderBoard({ isApproved: true });
    await userEvent.click(
      screen.getByRole('button', { name: 'Render presenter' }),
    );
    await waitFor(() => expect(mocks.openConfirm).toHaveBeenCalled());
    const confirm = mocks.openConfirm.mock.calls[0]?.[0] as {
      message: string;
      onConfirm: () => void;
    };
    expect(confirm.message).toBe(
      '1 part, about 01:05 of video: 30 credits. Parts already rendered are not charged again.',
    );
    expect(props.actions?.renderPresenter).not.toHaveBeenCalled();
    confirm.onConfirm();
    await waitFor(() =>
      expect(props.actions?.renderPresenter).toHaveBeenCalledWith(
        'aRoll',
        expect.objectContaining({ inputHash: HASH }),
      ),
    );
  });

  it('opens the finished edit in the Editor once every part is ready', async () => {
    const props = renderBoard({
      isApproved: true,
      run: runWith({
        aRoll: {
          presenterId: 'presenter-1',
          modelKey: 'heygen/avatar-iv',
          chunks: [chunk('ready')],
        },
      }),
    });
    expect(screen.getByText('1 of 1 parts ready')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the edit' }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/org/brand/editor/project-9'),
    );
    expect(props.actions?.assembleLongForm).toHaveBeenCalledWith('aRoll');
  });

  it('keeps the animatic closed while its parts are still speaking', () => {
    renderBoard({
      run: runWith({
        animatic: {
          presenterId: 'presenter-1',
          modelKey: 'elevenlabs/flash',
          chunks: [chunk('submitted')],
        },
      }),
    });
    expect(screen.getByText('Speaking the script')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open animatic' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: 'Draft animatic' }),
    ).toHaveProperty('disabled', true);
  });
});
