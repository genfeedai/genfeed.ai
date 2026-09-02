'use client';

import type { DropdownDirection } from '@genfeedai/contracts';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import type { ReactNode } from 'react';

interface AspectRatioDropdownProps {
  name: string;
  value: string;
  ratios: readonly string[];
  onChange: (name: string, value: string) => void;
  className?: string;
  isDisabled?: boolean;
  placeholder?: string;
  tooltip?: string;
  triggerDisplay?: 'default' | 'icon-only';
  icon?: ReactNode;
  direction?: DropdownDirection;
}

function getAspectRatioIcon(ratio: string): ReactNode | undefined {
  switch (ratio) {
    case '16:9':
    case '4:3':
      return <RectangleHorizontal size={16} />;
    case '9:16':
    case '3:4':
      return <RectangleVertical size={16} />;
    case '1:1':
      return <Square size={16} />;
    default:
      return undefined;
  }
}

export default function AspectRatioDropdown({
  name,
  value,
  ratios,
  onChange,
  className,
  isDisabled = false,
  placeholder = 'Aspect ratio',
  tooltip,
  triggerDisplay = 'default',
  icon,
  direction,
}: AspectRatioDropdownProps) {
  const options = ratios.map((ratio) => ({
    icon: getAspectRatioIcon(ratio),
    label: ratio,
    value: ratio,
  }));

  return (
    <ButtonDropdown
      name={name}
      value={value}
      options={options}
      onChange={onChange}
      className={className}
      isDisabled={isDisabled}
      placeholder={placeholder}
      tooltip={tooltip}
      triggerDisplay={triggerDisplay}
      icon={icon}
      direction={direction}
    />
  );
}
