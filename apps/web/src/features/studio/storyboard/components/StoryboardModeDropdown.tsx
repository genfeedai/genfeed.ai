'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  PROMPT_BAR_CHIP_CLASS,
  PROMPT_BAR_CHIP_FIT_CLASS,
  PROMPT_BAR_CHIP_LABEL_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { keepFocusOnSwitch } from '@ui/prompt-bars/base/keep-focus-on-switch';
import {
  ChevronDown,
  Images,
  type LucideIcon,
  Mic,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo } from 'react';

export type StoryboardCreateMode = 'brief' | 'longForm' | 'slideshow' | 'video';

interface StoryboardModeDropdownProps {
  isDisabled?: boolean;
  mode: StoryboardCreateMode;
  onChange: (mode: StoryboardCreateMode) => void;
}

interface StoryboardModeOption {
  description: string;
  Icon: LucideIcon;
  label: string;
  value: StoryboardCreateMode;
}

/**
 * Prompt-bar control for what a new storyboard is made from, in the same
 * chip-dropdown shape as the Agent's mode picker.
 */
export default function StoryboardModeDropdown({
  isDisabled,
  mode,
  onChange,
}: StoryboardModeDropdownProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.create');
  const options = useMemo<readonly StoryboardModeOption[]>(
    () => [
      {
        description: translate('modes.brief'),
        Icon: Sparkles,
        label: translate('fromBrief'),
        value: 'brief',
      },
      {
        description: translate('modes.longForm'),
        Icon: Mic,
        label: translate('longFormTitle'),
        value: 'longForm',
      },
      {
        description: translate('modes.slideshow'),
        Icon: Images,
        label: translate('slideshowTitle'),
        value: 'slideshow',
      },
      {
        description: translate('modes.video'),
        Icon: Repeat2,
        label: translate('remixTitle'),
        value: 'video',
      },
    ],
    [translate],
  );
  const active = options.find((option) => option.value === mode) ?? options[0];
  const triggerLabel = translate('sourceTriggerAria', { source: active.label });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={triggerLabel}
          className={cn(PROMPT_BAR_CHIP_CLASS, PROMPT_BAR_CHIP_FIT_CLASS)}
          icon={<active.Icon aria-hidden className={SHELL_ICON_CLASS} />}
          isDisabled={isDisabled}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={triggerLabel}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className={PROMPT_BAR_CHIP_LABEL_CLASS}>{active.label}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 text-muted-foreground',
              PROMPT_BAR_CHIP_LABEL_CLASS,
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        onCloseAutoFocus={keepFocusOnSwitch}
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-xs normal-case tracking-normal text-foreground">
          {translate('sourceAria')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            const next = options.find((option) => option.value === value);
            if (next) onChange(next.value);
          }}
          value={mode}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.Icon
                aria-hidden
                className="size-4 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs normal-case">
                  {option.label}
                </span>
                <span className="text-2xs normal-case leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
