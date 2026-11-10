import {
  addAssetVariant,
  mergeAssetBibleEdit,
  planAssetRequest,
} from '@api/collections/content-runs/services/storyboard-asset-bible-state';
import type { StoryboardAssetEntry } from '@genfeedai/contracts/api-types/contracts/storyboard-asset-bible.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';

const clock: StoryboardAssetEntry = {
  id: 'clock',
  kind: 'prop',
  label: 'brass clock',
  sourceAssetIds: [],
  variantAssetIds: ['clock-1', 'clock-2'],
  chosenAssetId: 'clock-2',
};

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 20,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [],
  assetBible: [clock],
};

describe('planAssetRequest', () => {
  it('writes one edit per angle from the chosen image', () => {
    expect(
      planAssetRequest(plan, clock, {
        action: 'angles',
        angles: ['the left side', 'above'],
      }),
    ).toEqual({
      stepId: 'asset-angles',
      aspectRatio: '1:1',
      items: [
        {
          prompt:
            'The same brass clock as in image 1, seen from the left side. Keep its shape, materials, colors and every detail exactly.',
          referenceAssetIds: ['clock-2'],
        },
        {
          prompt:
            'The same brass clock as in image 1, seen from above. Keep its shape, materials, colors and every detail exactly.',
          referenceAssetIds: ['clock-2'],
        },
      ],
    });
  });
});

describe('mergeAssetBibleEdit', () => {
  it('keeps the variants the server recorded and drops a choice that is not the entry’s own', () => {
    expect(
      mergeAssetBibleEdit(
        [{ ...clock, variantAssetIds: ['clock-1', 'clock-2', 'clock-3'] }],
        [
          {
            ...clock,
            label: 'old brass clock',
            variantAssetIds: ['forged'],
            chosenAssetId: 'forged',
          },
        ],
      ),
    ).toEqual([
      {
        id: 'clock',
        kind: 'prop',
        label: 'old brass clock',
        sourceAssetIds: [],
        variantAssetIds: ['clock-1', 'clock-2', 'clock-3'],
      },
    ]);
  });

  it('keeps the bible when an edit leaves it out', () => {
    expect(mergeAssetBibleEdit([clock], undefined)).toEqual([clock]);
  });
});

describe('addAssetVariant', () => {
  it('keeps the chosen image when a full entry takes a new variant', () => {
    const full = {
      ...clock,
      variantAssetIds: Array.from({ length: 24 }, (_, index) => `v-${index}`),
      chosenAssetId: 'v-0',
    };
    const entry = addAssetVariant(
      { ...plan, assetBible: [full] },
      'clock',
      'new',
    ).assetBible?.[0];
    expect(entry?.chosenAssetId).toBe('v-0');
    expect(entry?.variantAssetIds.slice(0, 2)).toEqual(['v-0', 'v-2']);
    expect(entry?.variantAssetIds.at(-1)).toBe('new');
  });
});
