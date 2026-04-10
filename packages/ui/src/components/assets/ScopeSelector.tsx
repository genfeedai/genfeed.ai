import { AssetScope } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ScopeBadgeProps,
  ScopeIconProps,
  ScopeSelectorProps,
} from '@genfeedai/props/components/scope-selector.props';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';

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
  return (
    <fieldset className={cn('space-y-3', className)}>
      {showLabel && (
        <legend className="block text-sm font-medium text-foreground/80">
          Access Control
        </legend>
      )}

      <RadioGroup
        aria-label="Access Control"
        disabled={isDisabled}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as AssetScope)}
        className={cn(
          'overflow-hidden rounded-2xl border',
          variant === 'panel'
            ? 'border-white/10 bg-white/[0.02] divide-y divide-white/8'
            : 'border-border bg-background divide-y divide-border',
        )}
      >
        {SCOPE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors',
              isDisabled && 'cursor-not-allowed opacity-50',
              value === option.value
                ? variant === 'panel'
                  ? 'bg-white/[0.05] text-white'
                  : 'bg-primary/10 text-foreground'
                : variant === 'panel'
                  ? 'bg-transparent text-white/80 hover:bg-white/[0.025]'
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
                        ? 'text-white'
                        : 'text-white/85'
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
                      ? 'text-white/75'
                      : 'text-white/55'
                    : 'text-foreground/70',
                )}
              >
                {option.description}
              </p>
            </div>
          </label>
        ))}
      </RadioGroup>
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
    [AssetScope.BRAND]: 'bg-blue-100 dark:bg-blue-900',
    [AssetScope.ORGANIZATION]: 'bg-green-100 dark:bg-green-900',
    [AssetScope.PUBLIC]: 'bg-purple-100 dark:bg-purple-900',
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
