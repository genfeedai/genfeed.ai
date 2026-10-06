'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationHarnessSettingsPopoverProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { useGenerationHarnessSettings } from '@hooks/data/generation/use-generation-harness-settings';
import GenerationHarnessSettingsCard from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsCard';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

function SettingsContent() {
  const { save, refresh, ...state } = useGenerationHarnessSettings(true);
  return (
    <GenerationHarnessSettingsCard
      {...state}
      onSave={save}
      onRefresh={refresh}
    />
  );
}

export default function GenerationHarnessSettingsPopover({
  className,
  isDisabled,
}: GenerationHarnessSettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const translate = useTranslations('ui.generationHarness');
  return (
    <Popover open={isOpen && !isDisabled} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          className={className}
          ariaLabel={translate('settings')}
          tooltip={translate('settings')}
          icon={<SlidersHorizontal className="size-4" />}
          isDisabled={isDisabled}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        avoidCollisions={false}
        className="w-[min(360px,calc(100vw-2rem))] p-0"
      >
        {isOpen && !isDisabled ? <SettingsContent /> : null}
      </PopoverContent>
    </Popover>
  );
}
