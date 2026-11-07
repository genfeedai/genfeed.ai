import type { StoryboardShotRender } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardShotRenders from './StoryboardShotRenders';

vi.mock('next-intl', async () => {
  const { translateFromCatalog: catalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return { useTranslations: catalog };
});

vi.mock('@genfeedai/agent/components/AgentMediaArtifactPreview', () => ({
  AgentMediaArtifactPreview: ({
    assets,
  }: {
    assets: ReadonlyArray<{ title?: string; url: string }>;
  }) => (
    <figure>
      <figcaption>{assets[0]?.title}</figcaption>
    </figure>
  ),
}));

function shotRender(
  stage: StoryboardShotRender['stage'],
  patch: Partial<StoryboardShotRender> = {},
): StoryboardShotRender {
  return {
    operationId: '00000000-0000-4000-8000-000000000001',
    shotId: 'shot-1',
    stage,
    modelKey: 'acme/cine-2-lite',
    state: 'ready',
    assetId: `${stage}-clip`,
    credits: 3,
    billingMode: 'platform',
    prompt: 'Mia sprints down a wet alley.',
    referenceAssetIds: ['still-1'],
    durationSeconds: 4,
    isAudioEnabled: false,
    isCurrent: true,
    updatedAt: '2026-11-07T12:00:00.000Z',
    ...patch,
  };
}

const urls = {
  'draft-clip': 'https://cdn.test/draft.mp4',
  'final-clip': 'https://cdn.test/final.mp4',
};

describe('StoryboardShotRenders', () => {
  it('offers both first renders for a shot with no video yet', () => {
    const onRender = vi.fn();
    render(
      <StoryboardShotRenders
        ordinal={1}
        videoUrls={{}}
        isDisabled={false}
        onRender={onRender}
      />,
    );
    expect(screen.getAllByText('Not rendered')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft' }));
    expect(onRender).toHaveBeenCalledWith('draft');
    expect(
      screen.getByRole('button', { name: 'Render final' }),
    ).toBeInTheDocument();
  });

  it('plays a finished draft and offers to promote it', () => {
    const onRender = vi.fn();
    render(
      <StoryboardShotRenders
        ordinal={1}
        draft={shotRender('draft')}
        videoUrls={urls}
        isDisabled={false}
        onRender={onRender}
      />,
    );
    expect(screen.getByText('Draft render of shot 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Promote to final' }));
    expect(onRender).toHaveBeenCalledWith('final');
  });

  it('does not promote a draft made before the shot changed', () => {
    render(
      <StoryboardShotRenders
        ordinal={1}
        draft={shotRender('draft', { isCurrent: false })}
        videoUrls={urls}
        isDisabled={false}
        onRender={vi.fn()}
      />,
    );
    expect(
      screen.getByText('From an earlier version of this shot'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Render final' }),
    ).toBeInTheDocument();
  });

  it('holds the stage while its render is running', () => {
    render(
      <StoryboardShotRenders
        ordinal={2}
        final={shotRender('final', { state: 'submitted', assetId: undefined })}
        videoUrls={urls}
        isDisabled={false}
        onRender={vi.fn()}
      />,
    );
    expect(screen.getByText('Rendering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo final' })).toBeDisabled();
  });

  it('says why a final cannot be assembled and notes continuity drift', () => {
    render(
      <StoryboardShotRenders
        ordinal={1}
        final={shotRender('final', {
          qa: {
            state: 'failed',
            failures: [
              {
                code: 'FREEZE_FRAMES',
                message: 'Freeze segment 2.00s–5.00s',
                timestamp: 2,
              },
            ],
            continuity: {
              state: 'flagged',
              notes: ['Her jacket is blue, not red.'],
            },
            checkedAt: '2026-11-07T12:01:00.000Z',
          },
        })}
        videoUrls={urls}
        isDisabled={false}
        onRender={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This clip cannot be assembled: Freeze segment 2.00s–5.00s. Render the final again.',
    );
    expect(
      screen.getByText('Continuity note: Her jacket is blue, not red.'),
    ).toBeInTheDocument();
  });
});
