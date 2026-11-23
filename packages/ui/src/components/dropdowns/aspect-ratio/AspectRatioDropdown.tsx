'use client';

import { OptionSelect } from '@ui/primitives/option-select';
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
}: AspectRatioDropdownProps) {
  const options = ratios.map((ratio) => ({
    icon: getAspectRatioIcon(ratio),
    label: ratio,
    value: ratio,
  }));

  return (
    <OptionSelect
      ariaLabel={tooltip ?? placeholder}
      className={className}
      icon={icon}
      isDisabled={isDisabled}
      isIconOnly={triggerDisplay === 'icon-only'}
      onValueChange={(next) => onChange(name, next)}
      options={options}
      placeholder={placeholder}
      value={value}
    />
  );
}
