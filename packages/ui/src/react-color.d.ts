declare module 'react-color' {
  import type { ComponentType } from 'react';

  export interface ColorResult {
    hex: string;
  }

  export interface SketchPickerProps {
    color?: string;
    disableAlpha?: boolean;
    onChange?: (color: ColorResult) => void;
    presetColors?: string[];
  }

  export const SketchPicker: ComponentType<SketchPickerProps>;
}
