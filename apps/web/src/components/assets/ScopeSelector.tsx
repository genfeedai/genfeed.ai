import { AssetScope } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';
import { Building2, Globe, Lock, Tag } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ScopeSelectorProps } from '@/props/components/scope-selector.props';

const SCOPE_ICONS: Record<AssetScope, ComponentType<{ className?: string }>> = {
  [AssetScope.USER]: Lock,
  [AssetScope.BRAND]: Tag,
  [AssetScope.ORGANIZATION]: Building2,
  [AssetScope.PUBLIC]: Globe,
};

/**
 * ScopeSelector Component
 *
 * Allows users to select the access scope for their assets.
 *
 * @example
 * ```tsx
 * <ScopeSelector
 *   value={ingredient.scope}
 *   onChange={(scope) => updateIngredient({ scope })}
 * />
 * ```
 */
export function ScopeSelector({
  value,
  onChange,
  isDisabled = false,
  className = '',
  variant = 'default',
  showLabel = true,
}: ScopeSelectorProps) {
  const groupProps = { 'aria-label': 'Access Control', disabled: isDisabled };
  const selectedOption = SCOPE_OPTIONS.find((option) => option.value === value);

  return (
    <fieldset
      className={cn(
        variant === 'segmented' ? 'flex flex-col gap-2' : 'space-y-3',
        className,
      )}
    >
      {showLabel && (
        <legend className="block text-sm font-medium text-foreground/80">
          Access Control
        </legend>
      )}

      {variant === 'segmented' ? (
        <>
          <SegmentedControl
            ariaLabel={groupProps['aria-label']}
            isDisabled={isDisabled}
            isFullWidth
            onValueChange={onChange}
            options={SCOPE_OPTIONS.map((option) => {
              const Icon = SCOPE_ICONS[option.value];

              return {
                ariaLabel: option.label,
                icon: <Icon />,
                label: <span className="hidden sm:inline">{option.label}</span>,
                value: option.value,
              };
            })}
            value={value}
          />

          {selectedOption ? (
            <p className="text-xs text-muted-foreground">
              {selectedOption.description}
            </p>
          ) : null}
        </>
      ) : (
        <RadioGroup
          {...groupProps}
          value={value}
          onValueChange={(nextValue) => onChange(nextValue as AssetScope)}
          className={cn(
            'overflow-hidden rounded-2xl border',
            variant === 'panel'
              ? 'divide-y divide-border border-border bg-tertiary'
              : 'border-border bg-background divide-y divide-border',
          )}
        >
          {SCOPE_OPTIONS.map((option) => (
            <div
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors',
                isDisabled && 'cursor-not-allowed opacity-50',
                value === option.value
                  ? variant === 'panel'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-primary/10 text-foreground'
                  : variant === 'panel'
                    ? 'bg-transparent text-foreground/80 hover:bg-accent/60'
                    : 'bg-transparent text-foreground hover:bg-muted/60',
              )}
            >
              <RadioGroupItem
                aria-label={option.label}
                value={option.value}
                className="mt-1"
              />

              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      variant === 'panel'
                        ? value === option.value
                          ? 'text-accent-foreground'
                          : 'text-foreground/90'
                        : 'text-foreground',
                    )}
                  >
                    {option.label}
                  </span>
                </div>

                <p
                  className={cn(
                    'text-xs',
                    variant === 'panel'
                      ? value === option.value
                        ? 'text-accent-foreground/80'
                        : 'text-muted-foreground'
                      : 'text-foreground/70',
                  )}
                >
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      )}
    </fieldset>
  );
}
