import type { ICaptionBurnStyle } from '@genfeedai/contracts';

/** The `style` presets of the `effect-captions` node, as burn-in styles. */
const PRESETS: Record<string, ICaptionBurnStyle> = {
  dynamic: { fontSizeRatio: 0.058, textCase: 'as-is' },
  minimal: { bottomAnchorRatio: 0.85, fontSizeRatio: 0.045 },
  tiktok: {
    bottomAnchorRatio: 0.72,
    fontSizeRatio: 0.07,
    textCase: 'upper',
  },
  youtube: {
    backgroundColor: '#0D0D0D',
    backgroundOpacity: 0.85,
    bottomAnchorRatio: 0.82,
    fontSizeRatio: 0.058,
  },
};

const SIZE_RATIOS: Record<string, number> = {
  large: 0.075,
  medium: 0.058,
  small: 0.045,
};

/** A number is a font height in pixels on a 1080 px short side. */
const REFERENCE_SHORT_SIDE = 1080;

function text(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function number(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Reads the caption options of an `effect-captions` node into a burn-in style.
 * Explicit options win over the `style` preset. Values the files service
 * cannot use are left out there and replaced by its defaults.
 */
export function buildCaptionBurnStyleFromConfig(
  config: Record<string, unknown>,
): ICaptionBurnStyle {
  const preset = PRESETS[text(config, 'style') ?? 'dynamic'] ?? PRESETS.dynamic;
  const size = config.fontSize;
  const fontSizeRatio =
    typeof size === 'string'
      ? SIZE_RATIOS[size]
      : typeof size === 'number' && size > 0
        ? size / REFERENCE_SHORT_SIDE
        : undefined;
  const position = text(config, 'position');
  const textCase = text(config, 'textCase');

  return {
    ...preset,
    ...(text(config, 'activeWordColor')
      ? { activeWordColor: text(config, 'activeWordColor') }
      : {}),
    ...(number(config, 'maxWordsPerGroup') !== undefined
      ? { maxWordsPerGroup: number(config, 'maxWordsPerGroup') }
      : {}),
    ...(text(config, 'backgroundColor')
      ? { backgroundColor: text(config, 'backgroundColor') }
      : {}),
    ...(number(config, 'backgroundOpacity') !== undefined
      ? { backgroundOpacity: number(config, 'backgroundOpacity') }
      : {}),
    ...(number(config, 'bottomAnchorRatio') !== undefined
      ? { bottomAnchorRatio: number(config, 'bottomAnchorRatio') }
      : {}),
    ...(text(config, 'fontColor')
      ? { fontColor: text(config, 'fontColor') }
      : {}),
    ...(text(config, 'fontFamily')
      ? { fontFamily: text(config, 'fontFamily') }
      : {}),
    ...(fontSizeRatio ? { fontSizeRatio } : {}),
    ...(position === 'top' || position === 'center' || position === 'bottom'
      ? { position }
      : {}),
    ...(textCase === 'upper' || textCase === 'as-is' ? { textCase } : {}),
  };
}
