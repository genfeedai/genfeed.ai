import { type SemanticThemeColors, semanticColorTokens } from '@ui/core/colors';
import { motionTokens } from '@ui/core/motion';
import { radiusTokens } from '@ui/core/radius';
import { typographyTokens } from '@ui/core/typography';

const INVARIANT_NATIVE_COLORS = {
  agent: '#38BDF8',
  agentForeground: '#000000',
  black: '#000000',
  google: '#4285F4',
  overlayScrim: 'rgba(0, 0, 0, 0.7)',
  transparent: 'transparent',
  white: '#FFFFFF',
} as const;

function toNativeThemeColors(colors: SemanticThemeColors) {
  return {
    ...INVARIANT_NATIVE_COLORS,
    accent: colors.accent.hex,
    accentDark: colors.accentForeground.hex,
    accentForeground: colors.accentForeground.hex,
    bgBorder: colors.border.hex,
    bgPrimary: colors.background.hex,
    bgSecondary: colors.backgroundSecondary.hex,
    bgTertiary: colors.backgroundTertiary.hex,
    card: colors.card.hex,
    cardForeground: colors.cardForeground.hex,
    error: colors.destructive.hex,
    errorForeground: colors.destructiveForeground.hex,
    indigo: colors.primary.hex,
    info: colors.info.hex,
    infoForeground: colors.infoForeground.hex,
    input: colors.input.hex,
    primary: colors.primary.hex,
    primaryForeground: colors.primaryForeground.hex,
    ring: colors.ring.hex,
    success: colors.success.hex,
    successForeground: colors.successForeground.hex,
    textMuted: colors.mutedForeground.hex,
    textPrimary: colors.foreground.hex,
    textSecondary: colors.mutedForeground.hex,
    textSubtle: colors.mutedForeground.hex,
    warning: colors.warning.hex,
    warningDark: colors.warningForeground.hex,
    warningForeground: colors.warningForeground.hex,
  } as const;
}

export const nativeThemeColors = {
  dark: toNativeThemeColors(semanticColorTokens.dark),
  light: toNativeThemeColors(semanticColorTokens.light),
} as const;

export type NativeThemeColors = (typeof nativeThemeColors)['dark'];

export const nativeTokenMap = {
  borderRadius: {
    full: 9999,
    lg: 8,
    md: 6,
    sm: 4,
    xl: 10,
    xxl: 12,
    xxxl: 16,
  },
  // Keep the historical dark alias for generated consumers. Runtime apps must
  // choose from `nativeThemeColors` so a preference change repaints in place.
  colors: nativeThemeColors.dark,
  colorSchemes: nativeThemeColors,
  motion: {
    durationFast: motionTokens.durationFast,
    durationNormal: motionTokens.durationNormal,
    durationSlow: motionTokens.durationSlow,
  },
  radius: radiusTokens,
  spacing: {
    lg: 16,
    md: 12,
    sm: 8,
    xl: 20,
    xs: 4,
    xxl: 24,
    xxxl: 32,
    xxxxl: 48,
  },
  typography: {
    fontSans: typographyTokens.fontSans,
    fontSerif: typographyTokens.fontSerif,
    h1: 26,
    h2: 24,
    h3: 20,
    hero: 28,
    lg: 14,
    md: 13,
    sm: 12,
    xl: 15,
    xs: 11,
    xxl: 16,
    xxxl: 18,
  },
} as const;
