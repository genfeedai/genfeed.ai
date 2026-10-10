'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type { StudioTypeDropdownProps } from '@genfeedai/props/studio/studio-playground.props';
import {
  getStudioPlaygroundTypeConfig,
  isStudioPlaygroundType,
  listStudioPlaygroundTypeConfigs,
} from '@pages/studio/playground/utils/studio-playground-types';
import { PROMPT_BAR_CHIP_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

function getTypeIcon(type: StudioPlaygroundType) {
  const config = getStudioPlaygroundTypeConfig(type);
  return getModelCategoryIcon(config.modelCategory ?? config.type);
}

/** Leading prompt-bar chip that switches what Studio generates. */
export default function StudioTypeDropdown({
  className,
  isDisabled = false,
  onChange,
  type,
}: StudioTypeDropdownProps): ReactElement {
  const translate = useTranslations('agent.generationSetup');
  const active = getStudioPlaygroundTypeConfig(type);
  const ActiveIcon = getTypeIcon(type);
  const triggerLabel = translate('generationTypeTrigger', {
    type: active.label,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={triggerLabel}
          className={cn(PROMPT_BAR_CHIP_CLASS, className)}
          icon={<ActiveIcon className="size-3.5" />}
          isDisabled={isDisabled}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={triggerLabel}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {active.label}
          <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-44"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            if (isStudioPlaygroundType(value)) {
              onChange(value);
            }
          }}
          value={type}
        >
          {listStudioPlaygroundTypeConfigs().map((config) => {
            const Icon = getTypeIcon(config.type);
            return (
              <DropdownMenuRadioItem key={config.type} value={config.type}>
                <span className="flex items-center gap-2 text-xs">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {config.label}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
