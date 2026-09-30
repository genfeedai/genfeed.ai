import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pages/studio/storyboard/hooks/use-storyboard-assets', () => ({
  useStoryboardAssets: vi.fn(() => ({})),
}));

const mocks = vi.hoisted(() => ({
  openGallery: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({ useGalleryModal: () => ({ openGallery: mocks.openGallery }) }),
);

vi.mock('@pages/studio/storyboard/components/StoryboardSelect', () => ({
  default: ({
    ariaLabel,
    onChange,
    value,
  }: {
    ariaLabel: string;
    onChange: (value: string) => void;
    value?: string;
  }) => (
    <span
      aria-label={ariaLabel}
      aria-selected={false}
      data-value={value}
      onClick={() => onChange(ariaLabel === 'Outputs' ? '3' : '1:1')}
      onKeyDown={() => undefined}
      role="option"
      tabIndex={0}
    />
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

import StoryboardRunRecipe from './StoryboardRunRecipe';

const run = {
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Original objective' },
    output: {
      aspectRatio: '9:16',
      count: 1,
      durationSeconds: 8,
      kind: 'video',
    },
    references: [
      { assetId: 'brand-ref', role: 'product', source: 'brand_default' },
      { assetId: 'style-ref', role: 'style', source: 'explicit' },
    ],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
  brandId: 'brand-1',
  id: 'run-1',
  phase: 'prefilled',
  revision: 1,
} as BrandRemixRunView;

describe('StoryboardRunRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStoryboardAssets).mockReturnValue({});
  });

  it.each([undefined, '', '   '])(
    'renders a contextual name for a real unnamed Image (%j)',
    (label) => {
      const asset = new Image({
        id: 'style-ref',
        brandId: 'brand-1',
        ...(label === undefined ? {} : { metadata: new Metadata({ label }) }),
      });
      vi.mocked(useStoryboardAssets).mockReturnValue({
        'image:style-ref': asset,
      });
      render(
        <StoryboardRunRecipe
          isWorking={false}
          onGenerate={vi.fn()}
          run={run}
        />,
      );
      expect(screen.getByText('Reference 1')).toBeVisible();
      expect(screen.queryByText('style-re')).toBeNull();
      expect(screen.queryByText('style-ref')).toBeNull();
    },
  );

  it('restores the saved recipe and generates with the edited values', () => {
    const onGenerate = vi.fn();
    render(
      <StoryboardRunRecipe
        isWorking={false}
        onGenerate={onGenerate}
        run={run}
      />,
    );

    const objective = screen.getByRole('textbox', { name: 'Objective' });
    expect(objective).toHaveValue('Original objective');
    fireEvent.change(objective, { target: { value: 'Sharper proof' } });
    fireEvent.change(screen.getByLabelText('Duration (seconds)'), {
      target: { value: '12.4' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Aspect ratio' }));
    fireEvent.click(screen.getByRole('option', { name: 'Outputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: '1:1',
      count: 3,
      durationSeconds: 12,
      objective: 'Sharper proof',
      referenceAssetIds: ['style-ref'],
    });
  });

  it('adds Library picks and removes explicit references', () => {
    const onGenerate = vi.fn();
    render(
      <StoryboardRunRecipe
        isWorking={false}
        onGenerate={onGenerate}
        run={run}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add references' }));
    const [{ onSelect }] = mocks.openGallery.mock.calls[0] as [
      {
        onSelect: (
          items: Array<{ id: string; brandId: string; metadataLabel: string }>,
        ) => void;
      },
    ];
    act(() =>
      onSelect([
        { id: 'library-1', brandId: 'brand-1', metadataLabel: 'Product photo' },
        { id: 'style-ref', brandId: 'brand-1', metadataLabel: 'Style photo' },
      ]),
    );
    expect(screen.getByText('Product photo')).toBeVisible();
    expect(screen.queryByText('library-1')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove reference Style photo' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ referenceAssetIds: ['library-1'] }),
    );
  });

  it('blocks generation without an objective and while a review owns the run', () => {
    const onGenerate = vi.fn();
    const { rerender } = render(
      <StoryboardRunRecipe
        isWorking={false}
        onGenerate={onGenerate}
        run={run}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();

    rerender(
      <StoryboardRunRecipe
        isWorking={false}
        key="in-review"
        onGenerate={onGenerate}
        run={{ ...run, phase: 'in_review' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Objective' })).toBeDisabled();
  });

  it('has no frame, duration or references for copy output', () => {
    render(
      <StoryboardRunRecipe
        isWorking={false}
        onGenerate={vi.fn()}
        run={{
          ...run,
          draft: { ...run.draft, output: { count: 2, kind: 'copy' } },
        }}
      />,
    );

    expect(screen.queryByRole('option', { name: 'Aspect ratio' })).toBeNull();
    expect(screen.queryByLabelText('Duration (seconds)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add references' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Outputs' })).toBeVisible();
  });
});
