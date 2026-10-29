import { AssetScope } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ScopeBadgeProps,
  ScopeIconProps,
  ScopeSelectorProps,
} from '@genfeedai/props/components/scope-selector.props';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@ui/primitives/toggle-group';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';
import { Building2, Globe, Lock, Tag } from 'lucide-react';
import type { ComponentType } from 'react';

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
          <ToggleGroup
            {...groupProps}
            className="w-full gap-1 rounded-lg bg-background-secondary p-1 shadow-border"
            onValueChange={(nextValue) => {
              // Radix reports '' when the active item is pressed again.
              if (nextValue) {
                onChange(nextValue as AssetScope);
              }
            }}
            type="single"
            value={value}
          >
            {SCOPE_OPTIONS.map((option) => {
              const Icon = SCOPE_ICONS[option.value];

              return (
                <ToggleGroupItem
                  aria-label={option.label}
                  className="flex-1 rounded-md"
                  key={option.value}
                  value={option.value}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{option.label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

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
                          : 'text-foreground/85'
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
                        ? 'text-accent-foreground/75'
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

/**
 * Scope Badge Component
 *
 * Displays a badge showing the current scope of an asset.
 *
 * @example
 * ```tsx
 * <ScopeBadge scope={ingredient.scope} />
 * ```
 */

export function ScopeBadge({ scope, className = '' }: ScopeBadgeProps) {
  const option = SCOPE_OPTIONS.find((opt) => opt.value === scope);

  if (!option) {
    return null;
  }

  const bgColor = {
    [AssetScope.USER]: 'bg-muted',
    [AssetScope.BRAND]: 'bg-info/15',
    [AssetScope.ORGANIZATION]: 'bg-success/15',
    [AssetScope.PUBLIC]: 'bg-primary/15',
  }[scope];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${bgColor} ${option.color} ${className}`}
    >
      <span>{option.label}</span>
    </span>
  );
}

/**
 * Scope Icon Component
 *
 * Displays just the icon for a scope (for compact views).
 *
 * @example
 * ```tsx
 * <ScopeIcon scope={ingredient.scope} />
 * ```
 */

export function ScopeIcon({
  scope,
  className = '',
  showTooltip = true,
}: ScopeIconProps) {
  const option = SCOPE_OPTIONS.find((opt) => opt.value === scope);

  if (!option) {
    return null;
  }

  return (
    <span
      className={`${className}`}
      title={showTooltip ? `${option.label}: ${option.description}` : undefined}
    >
      {option.label.charAt(0)}
    </span>
  );
}

export type { AssetScope };
// Export scope options for reuse
export { SCOPE_OPTIONS };
