import { describe, expect, it } from 'vitest';
import { semanticColorTokens } from '@ui/core/colors';
import { nativeThemeColors } from '@ui/semantic/mobile';

describe('nativeThemeColors', () => {
  it.each(['light', 'dark'] as const)(
    'derives the %s mobile palette from canonical semantic colors',
    (theme) => {
      const semantic = semanticColorTokens[theme];
      const native = nativeThemeColors[theme];

      expect(native.bgPrimary).toBe(semantic.background.hex);
      expect(native.bgSecondary).toBe(semantic.backgroundSecondary.hex);
      expect(native.bgTertiary).toBe(semantic.backgroundTertiary.hex);
      expect(native.bgBorder).toBe(semantic.border.hex);
      expect(native.textPrimary).toBe(semantic.foreground.hex);
      expect(native.textMuted).toBe(semantic.mutedForeground.hex);
      expect(native.primary).toBe(semantic.primary.hex);
      expect(native.primaryForeground).toBe(semantic.primaryForeground.hex);
      expect(native.error).toBe(semantic.destructive.hex);
      expect(native.errorForeground).toBe(
        semantic.destructiveForeground.hex,
      );
    },
  );

  it('keeps foreground roles distinct from their semantic backgrounds', () => {
    expect(nativeThemeColors.dark.primaryForeground).not.toBe(
      nativeThemeColors.dark.primary,
    );
    expect(nativeThemeColors.light.primaryForeground).not.toBe(
      nativeThemeColors.light.primary,
    );
    expect(nativeThemeColors.dark.agentForeground).not.toBe(
      nativeThemeColors.dark.agent,
    );
  });
});
