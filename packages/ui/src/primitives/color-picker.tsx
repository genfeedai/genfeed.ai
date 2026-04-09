/// <reference path="../react-color.d.ts" />

import { ButtonVariant } from '@genfeedai/enums';
import { useMemo, useState } from 'react';
import { type ColorResult, SketchPicker } from 'react-color';
import { Button } from './button';
import Field from './field';

const DEFAULT_PRESET_COLOR_TOKENS = [
  '--foreground',
  '--background',
  '--destructive',
  '--success',
  '--primary',
  '--warning',
  '--accent-violet',
  '--accent-purple',
  '--accent-pink',
  '--accent-rose',
  '--accent-orange',
  '--platform-instagram',
] as const;

const DEFAULT_COLOR = '#000000';

export interface ColorPickerProps {
  label?: string;
  value?: string;
  onChange?: (color: string) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  pickerType?: 'sketch' | 'chrome' | 'compact';
  showAlpha?: boolean;
  presetColors?: string[];
  position?: 'left' | 'right';
}

function resolveThemeColorToken(token: string): string {
  if (typeof window === 'undefined') {
    return `hsl(var(${token}))`;
  }

  const tokenValue = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();

  if (!tokenValue) {
    return `hsl(var(${token}))`;
  }

  if (
    tokenValue.startsWith('#') ||
    tokenValue.startsWith('rgb') ||
    tokenValue.startsWith('hsl')
  ) {
    return tokenValue;
  }

  if (tokenValue.includes('%')) {
    return `hsl(${tokenValue})`;
  }

  return tokenValue;
}

export default function ColorPicker({
  label,
  value = DEFAULT_COLOR,
  onChange = () => {},
  isRequired = false,
  isDisabled = false,
  className = '',
  helpText,
  showAlpha = false,
  position = 'left',
  presetColors,
}: ColorPickerProps) {
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [color, setColor] = useState(value);

  const resolvedPresetColors = useMemo(() => {
    if (presetColors && presetColors.length > 0) {
      return presetColors;
    }

    return DEFAULT_PRESET_COLOR_TOKENS.map((token) =>
      resolveThemeColorToken(token),
    );
  }, [presetColors]);

  const handleClick = () => {
    if (!isDisabled) {
      setDisplayColorPicker(!displayColorPicker);
    }
  };

  const handleClose = () => {
    setDisplayColorPicker(false);
  };

  const handleChange = (colorResult: ColorResult) => {
    const nextColor = showAlpha ? colorResult.hex : colorResult.hex;
    setColor(nextColor);
    onChange(nextColor);
  };

  return (
    <Field label={label} helpText={helpText} isRequired={isRequired}>
      <div className={`color-picker-wrapper ${className}`}>
        <div className="relative">
          <Button
            withWrapper={false}
            variant={ButtonVariant.OUTLINE}
            onClick={handleClick}
            isDisabled={isDisabled}
            className="h-10 w-full flex items-center gap-2"
            ariaLabel={`Select color, current: ${color}`}
            aria-expanded={displayColorPicker}
          >
            <div
              className="w-8 h-8 border border-white/[0.08]"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-left">{color}</span>
          </Button>

          {displayColorPicker && (
            <>
              <Button
                type="button"
                variant={ButtonVariant.UNSTYLED}
                className="fixed inset-0 z-10"
                onClick={handleClose}
                ariaLabel="Close color picker"
              />
              <div
                className={`absolute z-20 mt-2 ${position === 'right' ? 'right-0' : 'left-0'}`}
              >
                <SketchPicker
                  color={color}
                  onChange={handleChange}
                  disableAlpha={!showAlpha}
                  presetColors={resolvedPresetColors}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Field>
  );
}
