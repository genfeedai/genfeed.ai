'use client';

import { VideoTransition } from '@genfeedai/contracts';
import type { TransitionSelectorProps } from '@genfeedai/props/studio/storyboard.props';
import type { DropdownFieldOption } from '@ui/primitives/dropdown-field';
import FormDropdown from '@ui/primitives/dropdown-field';
import { Blend } from 'lucide-react';
import type { ChangeEvent } from 'react';

const TRANSITION_OPTIONS: DropdownFieldOption[] = [
  {
    description: 'Hard cut between clips',
    key: VideoTransition.NONE,
    label: 'None',
  },
  {
    description: 'Fade through black',
    key: VideoTransition.FADE,
    label: 'Fade',
  },
  {
    description: 'Cross-dissolve between clips',
    key: VideoTransition.DISSOLVE,
    label: 'Dissolve',
  },
  {
    description: 'Wipe from right to left',
    key: VideoTransition.WIPELEFT,
    label: 'Wipe left',
  },
  {
    description: 'Wipe from left to right',
    key: VideoTransition.WIPERIGHT,
    label: 'Wipe right',
  },
  {
    description: 'Wipe upward',
    key: VideoTransition.WIPEUP,
    label: 'Wipe up',
  },
  {
    description: 'Wipe downward',
    key: VideoTransition.WIPEDOWN,
    label: 'Wipe down',
  },
  {
    description: 'Open from the centre',
    key: VideoTransition.CIRCLEOPEN,
    label: 'Circle open',
  },
  {
    description: 'Close towards the centre',
    key: VideoTransition.CIRCLECLOSE,
    label: 'Circle close',
  },
  {
    description: 'Slide the next clip in from the right',
    key: VideoTransition.SLIDELEFT,
    label: 'Slide left',
  },
  {
    description: 'Slide the next clip in from the left',
    key: VideoTransition.SLIDERIGHT,
    label: 'Slide right',
  },
];

export default function TransitionSelector({
  value,
  onChange,
  label = 'Transition',
  placeholder = 'Select transition…',
  isDisabled = false,
  className,
  dropdownDirection = 'up',
  isFullWidth = false,
}: TransitionSelectorProps) {
  const updateTransitionSelector = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    onChange(selectedValue ? (selectedValue as VideoTransition) : undefined);
  };

  return (
    <FormDropdown
      name="transition"
      value={value}
      icon={<Blend />}
      label={label}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isNoneEnabled={true}
      isFullWidth={isFullWidth}
      className={className}
      dropdownDirection={dropdownDirection}
      options={TRANSITION_OPTIONS}
      onChange={updateTransitionSelector}
    />
  );
}
