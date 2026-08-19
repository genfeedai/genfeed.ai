import {
  nativeThemeColors,
  nativeTokenMap,
  type NativeThemeColors,
} from '@genfeedai/ui/semantic/mobile';

export { nativeThemeColors };
export const spacing = nativeTokenMap.spacing;
export const borderRadius = nativeTokenMap.borderRadius;
export const fontSize = nativeTokenMap.typography;

export type Colors = NativeThemeColors;
export type { NativeThemeColors };
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type FontSize = typeof fontSize;
