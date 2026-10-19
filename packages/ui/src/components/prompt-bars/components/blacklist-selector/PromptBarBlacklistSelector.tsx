'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarBlacklistSelectorProps } from '@genfeedai/props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';
import { useWatch } from 'react-hook-form';

/**
 * Pick what a generation should avoid ("No text", "No watermark", ...).
 * The selected keys are sent as the request `blacklist`.
 */
const PromptBarBlacklistSelector = memo(function PromptBarBlacklistSelector({
  blacklists,
  form,
  controlClass,
  isDisabled,
  onChange,
}: PromptBarBlacklistSelectorProps) {
  const translate = useTranslations('ui.promptBarBlacklist');
  const selectedKeys =
    useWatch({ control: form.control, name: 'blacklist' }) ?? [];

  const toggle = useCallback(
    (key: string, isChecked: boolean) => {
      const current = form.getValues('blacklist') ?? [];
      const next = isChecked
        ? [...current.filter((value) => value !== key), key]
        : current.filter((value) => value !== key);

      form.setValue('blacklist', next, { shouldValidate: true });
      onChange?.();
    },
    [form, onChange],
  );

  if (blacklists.length === 0) {
    return null;
  }

  const selectedCount = blacklists.filter((blacklist) =>
    selectedKeys.includes(blacklist.key),
  ).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          isDisabled={isDisabled}
          tooltip={translate('avoid')}
          tooltipPosition="top"
          ariaLabel={translate('chooseWhatToAvoid')}
          className={cn(
            'relative h-8 rounded-lg px-2 hover:bg-accent normal-case flex items-center gap-2',
            selectedCount > 0 ? 'text-foreground' : 'text-foreground/70',
            controlClass,
          )}
        >
          <Ban className="size-4" />
          {selectedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-fit h-5 flex items-center justify-center px-1 text-2xs font-bold text-primary-foreground bg-primary rounded-full tabular-nums">
              {selectedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground/70">
          {translate('avoid')}
        </p>

        {blacklists.map((blacklist) => (
          <Checkbox
            key={blacklist.key}
            name={`blacklist-${blacklist.key}`}
            label={blacklist.label}
            isChecked={selectedKeys.includes(blacklist.key)}
            onChange={(event) => toggle(blacklist.key, event.target.checked)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
});

export default PromptBarBlacklistSelector;
