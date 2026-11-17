import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  diffVideoKit,
  finishingFromBrand,
  toOwnerRules,
} from './brand-video-kit.helpers';

function draft(patch: Partial<IBrandKitDraft> = {}): IBrandKitDraft {
  return { fields: {}, ...patch } as IBrandKitDraft;
}

const FINISHING = {
  endCard: { durationSeconds: 3, isEnabled: false },
  lut: { isEnabled: false },
  watermark: { opacity: 0.35, position: 'bottom-right' as const },
};

describe('toOwnerRules', () => {
  it('drops blank rows and numbers the rest by position', () => {
    expect(
      toOwnerRules('shot', ['Open on the product', '  ', 'Hold the pour']),
    ).toEqual([
      {
        evidenceIds: ['owner-video'],
        id: 'owner-video-shot-1',
        match: 'semantic',
        required: true,
        text: 'Open on the product',
      },
      {
        evidenceIds: ['owner-video'],
        id: 'owner-video-shot-2',
        match: 'semantic',
        required: true,
        text: 'Hold the pour',
      },
    ]);
  });
});

describe('finishingFromBrand', () => {
  it('mirrors the brand row and falls back to the defaults', () => {
    expect(finishingFromBrand({} as IBrand)).toEqual(FINISHING);
    expect(
      finishingFromBrand({
        endCardAssetId: 'asset-1',
        endCardDurationSeconds: 5,
        isEndCardEnabled: true,
        isLutEnabled: true,
        lutFileName: 'warm.cube',
        watermarkOpacity: 0.5,
        watermarkPosition: 'top-left',
        watermarkText: 'acme.coffee',
      } as IBrand),
    ).toEqual({
      endCard: { assetId: 'asset-1', durationSeconds: 5, isEnabled: true },
      lut: { fileName: 'warm.cube', isEnabled: true },
      watermark: { opacity: 0.5, position: 'top-left', text: 'acme.coffee' },
    });
  });
});

describe('diffVideoKit', () => {
  it('lists nothing when the draft matches the approved revision', () => {
    const approved = draft({ finishing: FINISHING });
    expect(diffVideoKit(approved, draft({ finishing: FINISHING }))).toEqual([]);
  });

  it('reports video identity and finishing changes in the tab order', () => {
    const approved = draft({ finishing: FINISHING });
    const changed = draft({
      finishing: {
        ...FINISHING,
        endCard: { durationSeconds: 4, isEnabled: true },
      },
      video: {
        pacing: { evidenceIds: ['owner-video'], tempo: 'fast' },
        shotRules: toOwnerRules('shot', ['Open on the product']),
        thumbnailRules: [],
      },
    });
    expect(
      diffVideoKit(approved, changed).map(({ after, before, group, key }) => ({
        after,
        before,
        group,
        key,
      })),
    ).toEqual([
      { after: 'fast', before: null, group: 'video', key: 'pacingTempo' },
      {
        after: ['Open on the product'],
        before: [],
        group: 'video',
        key: 'shotRules',
      },
      { after: true, before: false, group: 'finishing', key: 'endCardEnabled' },
      { after: 4, before: 3, group: 'finishing', key: 'endCardSeconds' },
    ]);
  });

  it('says only that an image is set or differs, never its id', () => {
    const withImage = (assetId: string) =>
      draft({
        finishing: {
          ...FINISHING,
          endCard: { assetId, durationSeconds: 3, isEnabled: true },
        },
      });
    expect(
      diffVideoKit(withImage('asset-1'), withImage('asset-2')).filter(
        (change) => change.key === 'endCardImage',
      ),
    ).toEqual([
      {
        after: 'differentImage',
        before: 'image',
        group: 'finishing',
        key: 'endCardImage',
      },
    ]);
  });

  it.each([
    [{ lightLogoId: 'asset-9' }, 'watermarkLightLogo', 'image'],
    [{ liveLogoId: 'asset-9' }, 'watermarkLiveLogo', 'image'],
    [{ sizeRatio: 0.1 }, 'watermarkSize', 10],
    [{ insetXRatio: 0.05 }, 'watermarkInsetX', 5],
    [{ insetYRatio: 0.235 }, 'watermarkInsetY', 23.5],
  ])('reports a changed watermark %j as %s', (patch, key, after) => {
    const changed = draft({
      finishing: {
        ...FINISHING,
        watermark: { ...FINISHING.watermark, ...patch },
      },
    });
    expect(
      diffVideoKit(draft({ finishing: FINISHING }), changed).map((change) => ({
        after: change.after,
        key: change.key,
      })),
    ).toEqual([{ after, key }]);
  });

  describe('when the approved revision predates finishing', () => {
    const baseline = {
      ...FINISHING,
      endCard: { durationSeconds: 5, isEnabled: true },
      watermark: { ...FINISHING.watermark, text: 'acme.coffee' },
    };

    it('lists nothing while the draft keeps the baseline finishing', () => {
      expect(
        diffVideoKit(draft(), draft({ finishing: baseline }), baseline),
      ).toEqual([]);
    });

    it('lists only the finishing values changed from the baseline', () => {
      const changed = draft({
        finishing: {
          ...baseline,
          endCard: { durationSeconds: 8, isEnabled: true },
          watermark: { ...baseline.watermark, text: 'acme.tea' },
        },
      });
      expect(
        diffVideoKit(draft(), changed, baseline).map(
          ({ after, before, group, key }) => ({ after, before, group, key }),
        ),
      ).toEqual([
        {
          after: 8,
          before: 5,
          group: 'finishing',
          key: 'endCardSeconds',
        },
        {
          after: 'acme.tea',
          before: 'acme.coffee',
          group: 'finishing',
          key: 'watermarkText',
        },
      ]);
    });

    it('compares nothing without a baseline', () => {
      expect(diffVideoKit(draft(), draft({ finishing: baseline }))).toEqual([]);
    });

    it('prefers the approved revision finishing over the baseline', () => {
      expect(
        diffVideoKit(
          draft({ finishing: FINISHING }),
          draft({ finishing: baseline }),
          { ...FINISHING, endCard: { durationSeconds: 9, isEnabled: true } },
        ).map((change) => change.key),
      ).toEqual(['endCardEnabled', 'endCardSeconds', 'watermarkText']);
    });
  });
});
