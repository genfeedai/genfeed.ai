import { describe, expect, it } from 'vitest';
import { parseCliArgs, UsageError } from '../cli';
import { assertCrossFamily } from '../families';
import {
  buildSmokePlan,
  MIN_SMOKE_CREDITS,
  plannedCredits,
  SMOKE_MEDIA_JUDGES,
  SMOKE_TEXT_JUDGE,
  SMOKE_TEXT_MODEL,
} from './plan';

const BASE = {
  dispatcher: 'live',
  mediums: ['text', 'image', 'video'],
} as const;

describe('buildSmokePlan', () => {
  it('refuses a missing, zero or too-small cap', () => {
    expect(() => buildSmokePlan({ ...BASE, maxCredits: 0 })).toThrow(
      UsageError,
    );
    expect(() => buildSmokePlan({ ...BASE, maxCredits: Number.NaN })).toThrow(
      UsageError,
    );
    expect(() =>
      buildSmokePlan({ ...BASE, maxCredits: MIN_SMOKE_CREDITS - 1 }),
    ).toThrow(/floor/);
  });

  it.each([20, 100, 300, 600, 777.77])(
    'never plans more than the %s-credit cap',
    (maxCredits) => {
      for (const mediums of [
        ['text', 'image', 'video'],
        ['text', 'image'],
        ['text'],
      ] as const) {
        const plan = buildSmokePlan({ ...BASE, maxCredits, mediums });
        expect(plannedCredits(plan)).toBeLessThanOrEqual(maxCredits);
        expect(plannedCredits(plan)).toBeGreaterThan(maxCredits * 0.98);
        for (const cell of plan.cells) {
          expect(cell.maxCredits).toBeGreaterThan(0);
        }
      }
    },
  );

  it('covers text, image and video, and says when video is left out', () => {
    expect(
      buildSmokePlan({ ...BASE, maxCredits: 300 }).cells.map(
        (cell) => cell.medium,
      ),
    ).toEqual(['text', 'image', 'video']);

    const noVideo = buildSmokePlan({
      ...BASE,
      maxCredits: 300,
      mediums: ['text', 'image'],
    });
    expect(noVideo.cells.map((cell) => cell.medium)).toEqual(['text', 'image']);
    expect(noVideo.skippedMediums).toEqual(['video']);
  });

  it('runs the nightly text lane on the whole cap it is given', () => {
    const plan = buildSmokePlan({
      ...BASE,
      maxCredits: 100,
      mediums: ['text'],
    });
    expect(plan.cells).toHaveLength(1);
    expect(plan.cells[0].maxCredits).toBe(100);
    expect(() =>
      buildSmokePlan({ ...BASE, maxCredits: 100, mediums: [] }),
    ).toThrow(UsageError);
  });

  it('builds invocations the real CLI accepts, each with a judge and no uncapped run', () => {
    const plan = buildSmokePlan({
      ...BASE,
      genfeedApiUrl: 'https://api.example.test/v1',
      kelderBrandId: 'brand_eval_kelder',
      maxCredits: 300,
    });
    for (const cell of plan.cells) {
      const parsed = parseCliArgs([
        ...cell.args,
        `--max-credits=${cell.maxCredits}`,
      ]);
      expect(parsed.maxCredits).toBe(cell.maxCredits);
      expect(parsed.judgeRegistryKeys.length).toBeGreaterThan(0);
    }
  });

  it('seats judges from other families than the text generator and media judges across three families', () => {
    expect(() =>
      assertCrossFamily({
        generatorRegistryKeys: [SMOKE_TEXT_MODEL],
        judgeRegistryKeys: [SMOKE_TEXT_JUDGE],
      }),
    ).not.toThrow();
    expect(
      new Set(SMOKE_MEDIA_JUDGES.map((key) => key.split('/')[0])).size,
    ).toBe(3);
  });

  it('needs the product API key only for live media cells', () => {
    const live = buildSmokePlan({ ...BASE, maxCredits: 300 });
    const stub = buildSmokePlan({
      ...BASE,
      dispatcher: 'stub',
      maxCredits: 300,
    });
    expect(live.cells.find((cell) => cell.id === 'image')?.requiresEnv).toEqual(
      ['CONTENT_EVAL_GENFEED_API_KEY'],
    );
    expect(live.cells.find((cell) => cell.id === 'text')?.requiresEnv).toEqual(
      [],
    );
    expect(stub.cells.every((cell) => cell.requiresEnv.length === 0)).toBe(
      true,
    );
  });

  it('runs the video drafts, which the bench keeps out of the public ladder', () => {
    const video = buildSmokePlan({ ...BASE, maxCredits: 300 }).cells.find(
      (cell) => cell.id === 'video',
    );
    expect(video?.args).toContain('--include-drafts=true');
  });
});
