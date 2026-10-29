import { buildCaptionBurnStyleFromConfig } from '@api/collections/workflows/utils/caption-burn-style.util';
import { describe, expect, it } from 'vitest';

describe('buildCaptionBurnStyleFromConfig', () => {
  it('turns the template defaults (numeric size, dynamic style) into a style', () => {
    expect(
      buildCaptionBurnStyleFromConfig({
        fontColor: '#FFFFFF',
        fontSize: 64,
        position: 'bottom',
        style: 'dynamic',
      }),
    ).toEqual({
      fontColor: '#FFFFFF',
      fontSizeRatio: 64 / 1080,
      position: 'bottom',
      textCase: 'as-is',
    });
  });

  it('reads the named sizes', () => {
    expect(
      buildCaptionBurnStyleFromConfig({ fontSize: 'large' }),
    ).toMatchObject({
      fontSizeRatio: 0.075,
    });
    expect(
      buildCaptionBurnStyleFromConfig({ fontSize: 'small' }),
    ).toMatchObject({
      fontSizeRatio: 0.045,
    });
  });

  it('lets explicit options win over the preset', () => {
    expect(
      buildCaptionBurnStyleFromConfig({
        bottomAnchorRatio: 0.776,
        fontFamily: 'INTER_BOLD',
        fontSize: 52,
        style: 'tiktok',
        textCase: 'as-is',
      }),
    ).toMatchObject({
      bottomAnchorRatio: 0.776,
      fontFamily: 'INTER_BOLD',
      fontSizeRatio: 52 / 1080,
      textCase: 'as-is',
    });
  });

  it('takes a backing band from the youtube preset and a custom one', () => {
    expect(buildCaptionBurnStyleFromConfig({ style: 'youtube' })).toMatchObject(
      {
        backgroundColor: '#0D0D0D',
      },
    );
    expect(
      buildCaptionBurnStyleFromConfig({
        backgroundColor: '#E83B3B',
        backgroundOpacity: 0.5,
        style: 'youtube',
      }),
    ).toMatchObject({ backgroundColor: '#E83B3B', backgroundOpacity: 0.5 });
  });

  it('ignores values of the wrong type and unknown presets', () => {
    expect(
      buildCaptionBurnStyleFromConfig({
        fontSize: -4,
        position: 'sideways',
        style: 'nope',
        textCase: 7,
      }),
    ).toEqual({ fontSizeRatio: 0.058, textCase: 'as-is' });
  });
});
