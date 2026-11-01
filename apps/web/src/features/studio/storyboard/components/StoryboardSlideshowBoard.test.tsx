import type {
  StoryboardPlan,
  StoryboardShot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryboardSlideshowActions } from '@/features/studio/props/storyboard.props';
import {
  editStoryboardShot,
  removeStoryboardShot,
  reorderStoryboardShots,
} from '@/features/studio/storyboard/utils/storyboard-plan';
import StoryboardSlideshowBoard from './StoryboardSlideshowBoard';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ info: mocks.info, success: mocks.success }),
  },
}));
vi.mock('@genfeedai/agent/components/AgentMediaArtifactPreview', () => ({
  AgentMediaArtifactPreview: ({
    assets,
  }: {
    assets: { alt: string; url: string }[];
  }) => <img alt={assets[0].alt} src={assets[0].url} />,
}));

function slide(
  ordinal: number,
  overrides: Partial<StoryboardShot> = {},
): StoryboardShot {
  return {
    id: `slide-${ordinal}`,
    ordinal,
    sectionLabel: `Habit ${ordinal}`,
    action: `Description ${ordinal}`,
    onScreenSpeaker: false,
    durationSeconds: null,
    stillAssetId: `asset-${ordinal}`,
    stillFreshness: 'fresh',
    transition: 'cut',
    ...overrides,
  };
}

const basePlan: StoryboardPlan = {
  kind: 'slideshow',
  title: 'Habits',
  logline: '',
  videoModelKey: null,
  format: '4:5',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [],
};

interface HarnessProps {
  readonly actions?: StoryboardSlideshowActions;
  readonly initial?: StoryboardShot[];
  readonly isApproved?: boolean;
}

/** Holds the slides the way the editor does, with the real plan edits. */
function Harness({
  actions,
  initial = [
    slide(1),
    slide(2),
    slide(3, { stillFreshness: 'missing', stillAssetId: undefined }),
  ],
  isApproved = false,
}: HarnessProps) {
  const [plan, setPlan] = useState<StoryboardPlan>({
    ...basePlan,
    shots: initial,
  });
  return (
    <StoryboardSlideshowBoard
      slides={plan.shots}
      format={plan.format}
      isApproved={isApproved}
      isDisabled={false}
      slideImages={{
        'asset-1': 'https://assets.test/1.jpg',
        'asset-2': 'https://assets.test/2.jpg',
      }}
      onPatchSlide={(id, patch) => setPlan(editStoryboardShot(plan, id, patch))}
      onMoveSlide={(id, offset) =>
        setPlan(reorderStoryboardShots(plan, id, offset))
      }
      onRemoveSlide={(id) => setPlan(removeStoryboardShot(plan, id))}
      onAddSlide={() =>
        setPlan({
          ...plan,
          shots: [...plan.shots, slide(plan.shots.length + 1)],
        })
      }
      onDrawImages={(ids) =>
        setPlan({
          ...plan,
          shots: plan.shots.map((shot) =>
            !ids || ids.includes(shot.id)
              ? { ...shot, stillFreshness: 'generating' }
              : shot,
          ),
        })
      }
      onPerform={(action) => void action(7)}
      actions={actions}
    />
  );
}

function slideNames() {
  return screen
    .getAllByRole('button', { name: /^Name of slide/ })
    .map((button) => button.textContent);
}

describe('StoryboardSlideshowBoard', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.success.mockReset();
    mocks.info.mockReset();
  });

  it('shows each slide image and how many images are ready', () => {
    render(<Harness />);

    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 images ready');
    expect(screen.getByAltText('Image for slide 1')).toHaveAttribute(
      'src',
      'https://assets.test/1.jpg',
    );
    expect(screen.getByText('No image yet')).toBeInTheDocument();
  });

  it('shows images drawing after every missing image is asked for', () => {
    render(<Harness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Draw missing images' }),
    );

    expect(screen.getByText('Drawing images…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Draw missing images' }),
    ).toBeDisabled();
  });

  it('draws only the slide asked for', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Draw image' }));

    expect(screen.getAllByText('Drawing image…')).toHaveLength(1);
  });

  it('reorders slides and renumbers them', () => {
    render(<Harness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Move slide 2 earlier' }),
    );

    expect(slideNames()).toEqual(['Habit 2', 'Habit 1', 'Habit 3']);
  });

  it('removes a slide and edits another description', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove slide 1' }));
    fireEvent.change(screen.getAllByLabelText('What the viewer sees')[0], {
      target: { value: 'A new description' },
    });

    expect(slideNames()).toEqual(['Habit 2', 'Habit 3']);
    expect(screen.getAllByLabelText('What the viewer sees')[0]).toHaveValue(
      'A new description',
    );
  });

  it('cannot move the first slide earlier or the last one later', () => {
    render(<Harness />);

    expect(
      screen.getByRole('button', { name: 'Move slide 1 earlier' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move slide 3 later' }),
    ).toBeDisabled();
  });

  it('stops adding slides at twelve', () => {
    render(
      <Harness initial={Array.from({ length: 11 }, (_, i) => slide(i + 1))} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add slide' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Add slide' })).toBeDisabled();
  });

  it('keeps the draft post unavailable until the slides are approved', () => {
    render(<Harness />);

    expect(
      screen.getByRole('button', { name: 'Save as draft post' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Approve the slides to save them as a draft post.'),
    ).toBeInTheDocument();
  });

  it('saves the approved slides as a draft post and opens it', async () => {
    const createPost = vi.fn(async (revision: number) => ({
      isExisting: false,
      postId: `post-for-${revision}`,
      slideCount: 3,
    }));
    render(<Harness isApproved actions={{ createPost }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save as draft post' }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/org/brand/publishing/posts/post-for-7',
      ),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      'Draft post saved with 3 slides.',
    );
  });

  it('says so when this version already has a draft post', async () => {
    const createPost = vi.fn(async () => ({
      isExisting: true,
      postId: 'post-9',
      slideCount: 3,
    }));
    render(<Harness isApproved actions={{ createPost }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save as draft post' }));

    await waitFor(() =>
      expect(mocks.info).toHaveBeenCalledWith(
        'This version already has a draft post.',
      ),
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
