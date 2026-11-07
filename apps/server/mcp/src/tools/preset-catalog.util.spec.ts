import { CINEMATIC_SHORTS } from '@genfeedai/contracts/constants/cinematic-shorts.constant';
import { STUDIO_SYSTEM_PRESETS } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import {
  describePreset,
  listPresetSummaries,
  PresetNotFoundError,
  PresetSlotsError,
} from '@mcp/tools/preset-catalog.util';
import { describe, expect, it } from 'vitest';

const [cinematic] = CINEMATIC_SHORTS;
const [banner] = STUDIO_SYSTEM_PRESETS.filter(
  (preset) => preset.key === 'studio-banner',
);

const rows = [
  {
    attributes: {
      category: 'image',
      description: banner.description,
      key: banner.key,
      label: banner.label,
      ...banner.values,
    },
    id: 'row-1',
  },
  {
    attributes: {
      category: 'video',
      cinematicShort: cinematic,
      description: cinematic.description,
      key: cinematic.key,
      label: cinematic.label,
    },
    id: 'row-2',
  },
  { attributes: { category: 'image', key: 'no-label' }, id: 'row-3' },
];

describe('describePreset precedence', () => {
  const platform = {
    attributes: { category: 'image', key: 'shared', label: 'Platform' },
  };
  const organization = {
    attributes: {
      category: 'image',
      key: 'shared',
      label: 'Organization',
      organizationId: 'org-1',
    },
  };

  it.each([
    ['platform first', [platform, organization]],
    ['organization first', [organization, platform]],
  ])(
    'prefers the organization preset for a shared key (%s)',
    (_name, candidates) => {
      expect(describePreset(candidates, { key: 'shared' })).toMatchObject({
        label: 'Organization',
      });
    },
  );
});

describe('listPresetSummaries', () => {
  it('lists image, video and storyboard presets and skips malformed rows', () => {
    expect(
      listPresetSummaries(rows, {}).map((preset) => [preset.kind, preset.key]),
    ).toEqual([
      ['image', 'studio-banner'],
      ['cinematic-short', 'cinematic-anime-short'],
      ['storyboard', 'productLaunch'],
      ['storyboard', 'founderStory'],
      ['storyboard', 'beforeAfter'],
    ]);
  });

  it('filters by kind and by search text', () => {
    expect(
      listPresetSummaries(rows, { kind: 'storyboard' }).map((p) => p.key),
    ).toEqual(['productLaunch', 'founderStory', 'beforeAfter']);
    expect(
      listPresetSummaries(rows, { search: 'BANNER' }).map((p) => p.key),
    ).toEqual(['studio-banner']);
  });
});

describe('describePreset', () => {
  it('returns the slot schema and an example for a cinematic short', () => {
    const detail = describePreset(rows, { key: cinematic.key });
    expect(detail).toMatchObject({
      example: cinematic.example,
      kind: 'cinematic-short',
      qaPassLimit: 2,
    });
    expect(detail).not.toHaveProperty('compiled');
    expect(JSON.stringify(detail.slotSchema)).toContain('titleText');
  });

  it('compiles the plan when slots are passed', () => {
    const detail = describePreset(rows, {
      brandName: 'Genfeed',
      key: cinematic.key,
      slots: cinematic.example,
    });
    expect(detail.compiled).toMatchObject({
      fps: 24,
      frameCount: 1440,
      runtimeSeconds: 60,
    });
  });

  it('reads an image preset and a storyboard starter by key', () => {
    expect(describePreset(rows, { key: 'studio-banner' })).toMatchObject({
      kind: 'image',
      values: { aspectRatio: '21:9' },
    });
    expect(describePreset(rows, { key: 'productLaunch' })).toMatchObject({
      kind: 'storyboard',
      shotCount: 5,
    });
  });

  it('rejects an unknown key, invalid slots, and slots on other kinds', () => {
    expect(() => describePreset(rows, { key: 'nope' })).toThrow(
      PresetNotFoundError,
    );
    expect(() =>
      describePreset(rows, { key: cinematic.key, slots: { subject: 'x' } }),
    ).toThrow(PresetSlotsError);
    expect(() =>
      describePreset(rows, { key: 'studio-banner', slots: {} }),
    ).toThrow(PresetSlotsError);
  });
});
