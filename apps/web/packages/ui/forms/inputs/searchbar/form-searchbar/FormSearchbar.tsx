'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormSearchbarProps } from '@props/forms/form.props';
import Button from '@ui/buttons/base/Button';
import type { ChangeEvent } from 'react';
import { HiMagnifyingGlass, HiXMark } from 'react-icons/hi2';

const SIZE_CLASSES: Record<ComponentSize, string> = {
  [ComponentSize.LG]: 'h-12 text-base',
  [ComponentSize.MD]: 'h-10 text-sm',
  [ComponentSize.SM]: 'h-8 text-sm',
  [ComponentSize.XS]: 'h-6 text-xs',
  [ComponentSize.XL]: 'h-14 text-lg',
};

const ICON_SIZES: Record<ComponentSize, string> = {
  [ComponentSize.LG]: 'w-6 h-6',
  [ComponentSize.MD]: 'w-4 h-4',
  [ComponentSize.SM]: 'w-4 h-4',
  [ComponentSize.XS]: 'w-3 h-3',
  [ComponentSize.XL]: 'w-7 h-7',
};

export default function FormSearchbar({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  inputClassName = '',
  onClear,
  showIcon = true,
  showClearButton = true,
  isDisabled = false,
  inputRef,
  onClick,
  onKeyDown,
  size = ComponentSize.SM,
}: FormSearchbarProps): React.ReactElement {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      // Create synthetic event for onChange
      const syntheticEvent = {
        target: { value: '' },
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    inputRef?.current?.focus();
  };

  const sizeClass = SIZE_CLASSES[size];
  const iconSize = ICON_SIZES[size];

  return (
    <div className={cn('relative', className)}>
      {showIcon && (
        <HiMagnifyingGlass
          className={cn(
            'absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/60 pointer-events-none z-10',
            iconSize,
          )}
        />
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          sizeClass,
          'border border-input px-3 w-full bg-background text-foreground',
          showIcon && 'pl-10',
          showClearButton && value && 'pr-8',
          inputClassName,
        )}
        disabled={isDisabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />

      {showClearButton && value && (
        <Button
          onClick={handleClear}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 p-1"
          icon={<HiXMark className={iconSize} />}
        />
      )}
    </div>
  );
}
