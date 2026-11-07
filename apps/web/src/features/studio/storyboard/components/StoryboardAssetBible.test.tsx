import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardAssetBible from './StoryboardAssetBible';

vi.mock('next-intl', async () => {
  const { translateFromCatalog: catalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return { useTranslations: catalog };
});

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 20,
  styleReferenceAssetIds: [],
  cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: [] }],
  shots: [],
  assetBible: [
    {
      id: 'mia-body',
      kind: 'character_body',
      label: 'Mia costume',
      castMemberId: 'mia',
      sourceAssetIds: [],
      variantAssetIds: ['body-1', 'body-2'],
      chosenAssetId: 'body-1',
      sheetEnvironment: 'outdoor',
    },
  ],
};

function Harness(
  props: Partial<Parameters<typeof StoryboardAssetBible>[0]> & {
    readonly onGenerate: Parameters<
      typeof StoryboardAssetBible
    >[0]['onGenerate'];
  },
) {
  const [current, setCurrent] = useState(plan);
  return (
    <StoryboardAssetBible
      canGenerate
      imageUrls={{}}
      isDisabled={false}
      onAddSources={vi.fn()}
      onChange={(assetBible) => setCurrent({ ...current, assetBible })}
      plan={current}
      {...props}
    />
  );
}

function renderBible(
  overrides: Partial<Parameters<typeof StoryboardAssetBible>[0]> = {},
) {
  const onGenerate = vi.fn();
  render(<Harness onGenerate={onGenerate} {...overrides} />);
  return { requests: () => onGenerate.mock.calls.map(([request]) => request) };
}

describe('StoryboardAssetBible', () => {
  it('marks the chosen variant and moves the choice on click', () => {
    renderBible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose Variant of Mia costume' }),
    );
    expect(
      screen
        .getAllByRole('button', { name: /Variant of Mia costume/ })
        .map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['false', 'true']);
  });

  it('asks for two variants by default, the costume swap and listed angles', () => {
    const { requests } = renderBible();
    fireEvent.click(screen.getByRole('button', { name: 'Generate variants' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Dress the real person' }),
    );
    fireEvent.change(screen.getByLabelText('Angles for Mia costume'), {
      target: { value: 'the back, the left side, ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'More angles' }));
    expect(requests()).toEqual([
      { entryId: 'mia-body', action: 'variants', count: 2 },
      { entryId: 'mia-body', action: 'costume' },
      {
        entryId: 'mia-body',
        action: 'angles',
        angles: ['the back', 'the left side'],
      },
    ]);
  });

  it('says how many images are generating and locks the entry', () => {
    renderBible({
      generations: [
        {
          operationId: '6f0c9ad4-1f4b-4c63-9b6e-3a0a8c1e2d11',
          entryId: 'mia-body',
          action: 'variants',
          modelKey: 'acme/design-1',
          state: 'submitted',
          credits: 4,
          billingMode: 'platform',
          updatedAt: '2026-11-07T12:00:00.000Z',
        },
      ],
    });
    expect(screen.getByText('1 image generating')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate variants' }),
    ).toBeDisabled();
  });

  it('adds a new character body set outdoors', () => {
    renderBible();
    fireEvent.change(screen.getByLabelText('Name of the new asset'), {
      target: { value: 'Leo costume' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    expect(
      screen.getByRole('article', { name: 'Leo costume' }),
    ).toHaveTextContent('Body and costume');
    expect(
      screen.getByLabelText('Character sheet setting for Leo costume'),
    ).toHaveTextContent('Empty outdoor place (realistic light)');
  });
});
