import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormToggleProps } from '@props/forms/form.props';
import { Switch } from '@ui/primitives/switch';

/**
 * FormToggle using shadcn Switch component
 * Provides accessible toggle with label and description support
 */
export default function FormToggle({
  label,
  description,
  isChecked,
  isDisabled,
  switchClassName,
  onChange = () => {},
}: FormToggleProps) {
  const handleCheckedChange = (checked: boolean) => {
    // Build a synthetic change event from switch state.
    const syntheticEvent = {
      target: { checked },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <fieldset className="">
      <label className="flex items-start gap-3 cursor-pointer">
        <Switch
          checked={isChecked ?? false}
          onCheckedChange={handleCheckedChange}
          disabled={isDisabled}
          className={switchClassName}
        />

        <div className="flex flex-col gap-1">
          <span
            className={cn(
              'text-sm font-medium transition-colors duration-200',
              switchClassName &&
                'peer-data-[state=checked]:text-[var(--accent-orange)]',
            )}
          >
            {label}
          </span>
          {description && (
            <span
              className={cn(
                'text-xs text-muted-foreground transition-colors duration-200',
                switchClassName &&
                  'peer-data-[state=checked]:text-[color:rgba(255,255,255,0.72)]',
              )}
            >
              {description}
            </span>
          )}
        </div>
      </label>
    </fieldset>
  );
}
