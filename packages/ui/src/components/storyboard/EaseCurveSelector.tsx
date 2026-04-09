'use client';

import { VideoEaseCurve } from '@genfeedai/enums';
import type { EaseCurveSelectorProps } from '@props/studio/storyboard.props';
import type { DropdownFieldOption } from '@ui/primitives/dropdown-field';
import FormDropdown from '@ui/primitives/dropdown-field';
import type { ChangeEvent } from 'react';
import { HiChartBar } from 'react-icons/hi2';

const EASE_CURVE_OPTIONS: DropdownFieldOption[] = [
  {
    description: 'Smooth start and end (exponential)',
    key: VideoEaseCurve.EASE_IN_OUT_EXPO,
    label: 'Ease In-Out Expo',
  },
  {
    description: 'Fast start, smooth end',
    key: VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC,
    label: 'Ease In Expo, Out Cubic',
  },
  {
    description: 'Very smooth start, gentle end',
    key: VideoEaseCurve.EASE_IN_QUART_OUT_QUAD,
    label: 'Ease In Quart, Out Quad',
  },
  {
    description: 'Balanced smooth curve',
    key: VideoEaseCurve.EASE_IN_OUT_CUBIC,
    label: 'Ease In-Out Cubic',
  },
  {
    description: 'Natural, organic feel',
    key: VideoEaseCurve.EASE_IN_OUT_SINE,
    label: 'Ease In-Out Sine',
  },
];

export default function EaseCurveSelector({
  value,
  onChange,
  label = 'Ease Curve',
  placeholder = 'Select ease curve...',
  isDisabled = false,
  className,
  dropdownDirection = 'up',
  isFullWidth = false,
}: EaseCurveSelectorProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    onChange(selectedValue ? (selectedValue as VideoEaseCurve) : undefined);
  };

  return (
    <FormDropdown
      name="easeCurve"
      value={value}
      icon={<HiChartBar />}
      label={label}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isNoneEnabled={true}
      isFullWidth={isFullWidth}
      className={className}
      dropdownDirection={dropdownDirection}
      options={EASE_CURVE_OPTIONS}
      onChange={handleChange}
    />
  );
}
